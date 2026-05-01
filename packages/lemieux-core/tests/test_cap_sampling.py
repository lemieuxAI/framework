"""Tests for the AAV-constrained sampling primitives.

These tests use a tiny in-memory SQLite DB so they're hermetic — no
dependency on the live legacy/data/store.sqlite content.
"""
from __future__ import annotations

import sqlite3

import pytest

from lemieux.core.cap_sampling import (
    fetch_goalie_pool,
    fetch_skater_pool,
    sample_combinations,
    sample_goalie_diff_combinations,
    value_of_goalie_diff,
    value_of_skater,
)


def _make_db() -> sqlite3.Connection:
    """Build a small fixture DB with player_contracts + skater_stats + team_stats + goalie_stats."""
    con = sqlite3.connect(":memory:")
    con.executescript("""
        CREATE TABLE player_contracts (
            player_slug TEXT PRIMARY KEY,
            player_name TEXT NOT NULL,
            team TEXT, position TEXT, age INTEGER,
            contract_signed_date TEXT, contract_length_years INTEGER,
            aav REAL, cap_hit REAL, total_value REAL,
            expiry_status TEXT, clause TEXT,
            roster_group TEXT, status TEXT, acquired TEXT,
            team_cap_hit_total REAL, team_cap_space REAL,
            team_upper_limit REAL, team_playoff_cap REAL,
            source_url TEXT, fetched_at TEXT
        );
        CREATE TABLE skater_stats (
            name TEXT, team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
            split TEXT, position TEXT, gp INTEGER, toi REAL,
            xgf REAL, xga REAL, gf REAL, ga REAL,
            cf REAL, ca REAL, hdcf REAL, hdca REAL
        );
        CREATE TABLE team_stats (
            team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
            toi REAL, gf REAL, ga REAL, xgf REAL, xga REAL,
            sf REAL, sa REAL, scf REAL, sca REAL, hdcf REAL, hdca REAL,
            cf REAL, ca REAL, gp INTEGER
        );
        CREATE TABLE goalie_stats (
            name TEXT, team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
            gp INTEGER, toi REAL, sa INTEGER, ga INTEGER, sv_pct REAL
        );
    """)

    # Skaters: 4 players with known AAVs and iso baselines
    contracts = [
        # name, slug, position, aav
        ("Alpha Player", "alpha-player", "C", 2_000_000),
        ("Bravo Player", "bravo-player", "L", 3_000_000),
        ("Charlie Player", "charlie-player", "R", 4_000_000),
        ("Delta Player", "delta-player", "D", 1_500_000),
        # Goalies
        ("Goalie One", "goalie-one", "G", 5_000_000),
        ("Goalie Two", "goalie-two", "G", 2_000_000),
        ("Goalie Three", "goalie-three", "G", 3_500_000),
    ]
    for name, slug, pos, aav in contracts:
        con.execute(
            "INSERT INTO player_contracts (player_slug, player_name, position, aav) VALUES (?, ?, ?, ?)",
            (slug, name, pos, aav),
        )

    # Skater iso baselines: synthetic xgf/xga so iso_net60 is predictable
    for name, pos, xgf, xga in [
        ("Alpha Player", "C", 50.0, 30.0),    # very positive iso
        ("Bravo Player", "L", 40.0, 35.0),    # mildly positive
        ("Charlie Player", "R", 30.0, 40.0),  # negative
        ("Delta Player", "D", 35.0, 38.0),    # mildly negative
    ]:
        con.execute("""
            INSERT INTO skater_stats (name, season, stype, sit, split, position,
                                       gp, toi, xgf, xga)
            VALUES (?, '20242025', 2, '5v5', 'oi', ?, 70, 1000.0, ?, ?)
        """, (name, pos, xgf, xga))

    # Team stats — needed by _pooled_iso_net for the off-iso side
    con.execute("""
        INSERT INTO team_stats (team_id, season, stype, sit, toi, xgf, xga, gp)
        VALUES ('LGU', '20242025', 2, '5v5', 8000.0, 240.0, 240.0, 82)
    """)

    # Goalies: 3 with different SV%
    for name, sa, ga, gp in [
        ("Goalie One", 1500, 130, 50),    # .9133 — best
        ("Goalie Two", 1000, 100, 30),    # .9000 — worst
        ("Goalie Three", 1200, 110, 40),  # .9083 — middle
    ]:
        sv = 1.0 - (ga / sa)
        con.execute("""
            INSERT INTO goalie_stats (name, season, stype, sit, gp, toi, sa, ga, sv_pct)
            VALUES (?, '20242025', 2, 'all', ?, 0, ?, ?, ?)
        """, (name, gp, sa, ga, sv))

    con.commit()
    return con


# ---------- pool fetcher tests ----------

def test_fetch_skater_pool_filters_aav_range():
    con = _make_db()
    pool = fetch_skater_pool(
        con, min_aav=1_000_000, max_aav=3_500_000,
        min_toi=100, pool_seasons=("20242025",),
    )
    names = {p["name"] for p in pool}
    # Alpha($2M), Bravo($3M), Delta($1.5M) — Charlie excluded (aav $4M > max)
    assert "Charlie Player" not in names
    assert "Alpha Player" in names
    assert "Bravo Player" in names


def test_fetch_skater_pool_min_toi_filter():
    con = _make_db()
    # All synthetic skaters have 1000 toi. Setting min_toi=2000 should empty pool.
    pool = fetch_skater_pool(
        con, min_aav=0, max_aav=10_000_000,
        min_toi=2000, pool_seasons=("20242025",),
    )
    assert len(pool) == 0


def test_fetch_goalie_pool_min_gp_filter():
    con = _make_db()
    pool = fetch_goalie_pool(
        con, min_gp=35, pool_seasons=("20242025",),
    )
    names = {g["name"] for g in pool}
    # Only Goalie One (50 GP) and Three (40 GP) pass min_gp=35
    assert "Goalie One" in names
    assert "Goalie Three" in names
    assert "Goalie Two" not in names


# ---------- value function tests ----------

def test_value_of_skater_iso_sign():
    con = _make_db()
    v = value_of_skater(
        con, "Alpha Player",
        expected_5v5_min_per_season=1000.0,
        pool_seasons=("20242025",),
    )
    # Alpha: xgf=50 / xga=30 / 1000 toi → on-ice xgf60=3, xga60=1.8.
    # Off-ice = team(240,240)/(8000-1000) ≈ 7000 toi, xgf_off=190, xga_off=210.
    # off_xgf60 = 190*60/7000 ≈ 1.629, off_xga60 = 210*60/7000 = 1.8.
    # iso_xgf60 = 3 - 1.629 = +1.371. iso_xga60 = 1.8 - 1.8 = 0.
    # iso_net60 ≈ +1.371. season_value = 1.371 * 1000 / 60 ≈ +22.85.
    assert v.iso_net60 > 1.0
    assert v.season_value_xg > 15.0


def test_value_of_goalie_diff_positive_when_in_better():
    con = _make_db()
    g = value_of_goalie_diff(
        con, in_name="Goalie One", out_name="Goalie Two",
        expected_sa_per_season=1500,
        pool_seasons=("20242025",),
    )
    # One: .9133, Two: .9000 → diff +.0133, value = .0133 * 1500 ≈ +20
    assert g.diff_sv_pct > 0
    assert g.season_value_xg > 0
    assert g.in_sv_pct > g.out_sv_pct


def test_value_of_goalie_diff_negative_when_in_worse():
    con = _make_db()
    g = value_of_goalie_diff(
        con, in_name="Goalie Two", out_name="Goalie One",
        pool_seasons=("20242025",),
    )
    # Reverse: in worse → negative
    assert g.diff_sv_pct < 0
    assert g.season_value_xg < 0


# ---------- sampler tests ----------

def test_sample_combinations_within_tolerance():
    con = _make_db()
    pool = fetch_skater_pool(
        con, min_aav=0, max_aav=10_000_000, min_toi=100,
        pool_seasons=("20242025",),
    )
    # Budget = $5M, tolerance = $200K. Valid combos: Alpha($2M)+Bravo($3M)=$5M,
    # Bravo($3M)+Delta($1.5M)=$4.5M (out of tolerance), Alpha+Delta=$3.5M (out),
    # etc. Singles: only Charlie at $4M out; nothing at $5M ±$200K
    combos = sample_combinations(
        con, budget=5_000_000, tolerance=200_000,
        n_samples=20, n_players_range=(1, 3), pool=pool,
    )
    assert len(combos) > 0
    aav_lookup = {p["name"]: p["aav"] for p in pool}
    for combo in combos:
        total = sum(aav_lookup[n] for n in combo)
        assert abs(total - 5_000_000) <= 200_000


def test_sample_combinations_excludes_listed_players():
    con = _make_db()
    pool = fetch_skater_pool(
        con, min_aav=0, max_aav=10_000_000, min_toi=100,
        pool_seasons=("20242025",),
    )
    combos = sample_combinations(
        con, budget=5_000_000, tolerance=2_000_000,
        n_samples=10, pool=pool,
        exclude=("Alpha Player",),
    )
    for combo in combos:
        assert "Alpha Player" not in combo


def test_sample_goalie_diff_combinations_meets_budget():
    con = _make_db()
    skater_pool = fetch_skater_pool(
        con, min_aav=0, max_aav=10_000_000, min_toi=100,
        pool_seasons=("20242025",),
    )
    goalie_pool = fetch_goalie_pool(con, min_gp=20, pool_seasons=("20242025",))
    # Budget: skater + (in_g - out_g) = ~$5M
    combos = sample_goalie_diff_combinations(
        con, budget=5_000_000, tolerance=1_000_000,
        n_samples=20,
        skater_pool=skater_pool, goalie_pool=goalie_pool,
    )
    if combos:  # may be empty if pool too small
        for c in combos:
            assert abs(c["total_cost"] - 5_000_000) <= 1_000_000
            assert c["in_goalie"] != c["out_goalie"]


def test_sample_returns_empty_on_empty_pool():
    con = _make_db()
    combos = sample_combinations(
        con, budget=5_000_000, n_samples=10,
        pool=[],  # empty
    )
    assert combos == []
