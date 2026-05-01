"""The Cullen-McDavid question — did EDM use the $7M discount well?

Premise (from John Cullen tweet, 2026-04-30):
  McDavid took ~$7M under market value on his extension.
  Bowman spent that money on:
    - Trent Frederic (full AAV)
    - The cap-hit difference between Stuart Skinner (out) and Tristan Jarry (in)

Total: Frederic ($3.85M) + (Jarry $5.375M − Skinner $2.6M) = $6.625M.

This analyzer:
  1. Computes EDM's actual choice value (Frederic's iso × notional 1000 5v5 min,
     plus the goalie SV% diff × 1500 expected SA).
  2. Samples 2 000 random skater+goalie-diff combinations summing to $6.625M ±$300K.
  3. Samples 2 000 random pure-skater combinations (1-3 skaters) summing to the same.
  4. Computes the same value metric for each combination.
  5. Reports where EDM's actual choice ranks vs the random distribution.

Output: cullen_mcdavid_question.numbers.json
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "packages" / "lemieux-core" / "src"))

from lemieux.core.cap_sampling import (
    DEFAULT_POOL_SEASONS,
    fetch_goalie_pool,
    fetch_skater_pool,
    sample_combinations,
    sample_goalie_diff_combinations,
    value_of_goalie_diff,
    value_of_skater,
)

DB = REPO / "legacy" / "data" / "store.sqlite"
OUT = Path(__file__).parent / "cullen_mcdavid_question.numbers.json"

BUDGET = 6_625_000.0
TOLERANCE = 300_000.0
N_SAMPLES = 2000
EXPECTED_5v5_MIN = 1000.0
EXPECTED_SA = 1500.0


def actual_edm_value(con) -> dict:
    skater = value_of_skater(con, "Trent Frederic",
                              expected_5v5_min_per_season=EXPECTED_5v5_MIN)
    goalie = value_of_goalie_diff(con, "Tristan Jarry", "Stuart Skinner",
                                   expected_sa_per_season=EXPECTED_SA)
    total_value = skater.season_value_xg + goalie.season_value_xg
    total_cost = skater.aav + goalie.aav_cost
    return {
        "skater_name": skater.name, "skater_aav": skater.aav,
        "skater_iso_net60": skater.iso_net60,
        "skater_pool_toi": skater.pool_toi,
        "skater_season_value_xg": skater.season_value_xg,
        "in_goalie": goalie.in_name, "out_goalie": goalie.out_name,
        "in_sv_pct": goalie.in_sv_pct, "out_sv_pct": goalie.out_sv_pct,
        "diff_sv_pct": goalie.diff_sv_pct,
        "goalie_aav_cost": goalie.aav_cost,
        "goalie_season_value_xg": goalie.season_value_xg,
        "total_cost": total_cost,
        "total_value_xg": total_value,
    }


def evaluate_skater_combo(con, names: tuple[str, ...]) -> float:
    """Sum of season_value_xg across all skaters in the combo."""
    return sum(
        value_of_skater(con, n, expected_5v5_min_per_season=EXPECTED_5v5_MIN).season_value_xg
        for n in names
    )


def evaluate_goalie_combo(con, combo: dict) -> float:
    skater_v = value_of_skater(con, combo["skater"],
                                expected_5v5_min_per_season=EXPECTED_5v5_MIN)
    goalie_v = value_of_goalie_diff(con, combo["in_goalie"], combo["out_goalie"],
                                     expected_sa_per_season=EXPECTED_SA)
    return skater_v.season_value_xg + goalie_v.season_value_xg


def percentile_of(value: float, distribution: list[float]) -> float:
    """Where does `value` rank in distribution? Returns 0-100, where 100 = top."""
    if not distribution:
        return float("nan")
    arr = np.asarray(distribution)
    return float((arr < value).sum() / len(arr) * 100)


def main():
    con = sqlite3.connect(DB)

    print("=" * 80)
    print("CULLEN-McDAVID QUESTION — actual vs random alternatives")
    print("=" * 80)
    print()

    actual = actual_edm_value(con)
    print(f"Actual EDM choice (Frederic + Jarry-for-Skinner):")
    print(f"  Frederic:    AAV=${actual['skater_aav']:>11,.0f}  iso_net60={actual['skater_iso_net60']:+.3f}  → season_value_xg = {actual['skater_season_value_xg']:+.2f}")
    print(f"  Jarry in:    SV%={actual['in_sv_pct']:.4f}")
    print(f"  Skinner out: SV%={actual['out_sv_pct']:.4f}")
    print(f"  Diff:        {actual['diff_sv_pct']:+.4f}  → season_value_xg = {actual['goalie_season_value_xg']:+.2f}")
    print(f"  Total cost:  ${actual['total_cost']:,.0f}")
    print(f"  Total value: {actual['total_value_xg']:+.2f} expected goals/season")
    print()

    # Build the pools once
    print("Building pools…")
    skater_pool = fetch_skater_pool(con,
                                     min_aav=800_000, max_aav=5_000_000,
                                     min_toi=200,
                                     pool_seasons=DEFAULT_POOL_SEASONS)
    goalie_pool = fetch_goalie_pool(con,
                                     min_gp=30,
                                     pool_seasons=DEFAULT_POOL_SEASONS)
    print(f"  skater pool: {len(skater_pool)} players  (AAV $0.8M-$5M, ≥200 min 5v5 pooled)")
    print(f"  goalie pool: {len(goalie_pool)} goalies   (≥30 GP pooled)")
    print()

    # Mode A — like-for-like (skater + goalie diff)
    print(f"Sampling Mode A (skater + goalie diff)…  budget=${BUDGET:,.0f} ±${TOLERANCE:,.0f}")
    mode_a_combos = sample_goalie_diff_combinations(
        con, budget=BUDGET, tolerance=TOLERANCE,
        n_samples=N_SAMPLES,
        skater_pool=skater_pool, goalie_pool=goalie_pool,
        exclude_skaters=("Trent Frederic",),
        exclude_goalies=("Stuart Skinner", "Tristan Jarry"),
    )
    mode_a_values: list[dict] = []
    for c in mode_a_combos:
        v = evaluate_goalie_combo(con, c)
        mode_a_values.append({**c, "season_value_xg": v})
    a_dist = [m["season_value_xg"] for m in mode_a_values]
    print(f"  found {len(mode_a_values)} combos")

    # Mode B — pure skaters
    print(f"Sampling Mode B (pure skater bundles, 1-3)…")
    mode_b_combos = sample_combinations(
        con, budget=BUDGET, tolerance=TOLERANCE,
        n_samples=N_SAMPLES, n_players_range=(1, 3),
        pool=skater_pool,
        exclude=("Trent Frederic",),
    )
    mode_b_values: list[dict] = []
    for combo in mode_b_combos:
        v = evaluate_skater_combo(con, combo)
        total_aav = sum(p["aav"] for p in skater_pool if p["name"] in combo)
        mode_b_values.append({
            "players": list(combo), "total_aav": total_aav,
            "season_value_xg": v,
        })
    b_dist = [m["season_value_xg"] for m in mode_b_values]
    print(f"  found {len(mode_b_values)} combos")
    print()

    # Compare
    actual_v = actual["total_value_xg"]
    a_pct = percentile_of(actual_v, a_dist)
    b_pct = percentile_of(actual_v, b_dist)

    a_arr = np.asarray(a_dist) if a_dist else np.array([0.0])
    b_arr = np.asarray(b_dist) if b_dist else np.array([0.0])

    summary = {
        "actual_edm_value_xg": actual_v,
        "mode_a": {
            "n": len(a_dist),
            "mean": float(np.mean(a_arr)) if a_dist else None,
            "median": float(np.median(a_arr)) if a_dist else None,
            "p10": float(np.percentile(a_arr, 10)) if a_dist else None,
            "p25": float(np.percentile(a_arr, 25)) if a_dist else None,
            "p75": float(np.percentile(a_arr, 75)) if a_dist else None,
            "p90": float(np.percentile(a_arr, 90)) if a_dist else None,
            "actual_percentile_rank": a_pct,
        },
        "mode_b": {
            "n": len(b_dist),
            "mean": float(np.mean(b_arr)) if b_dist else None,
            "median": float(np.median(b_arr)) if b_dist else None,
            "p10": float(np.percentile(b_arr, 10)) if b_dist else None,
            "p25": float(np.percentile(b_arr, 25)) if b_dist else None,
            "p75": float(np.percentile(b_arr, 75)) if b_dist else None,
            "p90": float(np.percentile(b_arr, 90)) if b_dist else None,
            "actual_percentile_rank": b_pct,
        },
    }

    # Top 10 alternatives in each mode
    top_a = sorted(mode_a_values, key=lambda m: -m["season_value_xg"])[:10]
    top_b = sorted(mode_b_values, key=lambda m: -m["season_value_xg"])[:10]
    bot_a = sorted(mode_a_values, key=lambda m: m["season_value_xg"])[:5]
    bot_b = sorted(mode_b_values, key=lambda m: m["season_value_xg"])[:5]

    print()
    print(f"Actual EDM value: {actual_v:+.2f} xG/season")
    print()
    print("MODE A summary (skater + goalie diff):")
    if a_dist:
        for k in ("p10", "p25", "median", "p75", "p90"):
            print(f"  {k:>8}: {summary['mode_a'][k]:+.2f}")
        print(f"  EDM percentile rank: {a_pct:.0f}th")
    print()
    print("MODE B summary (pure skater bundles):")
    if b_dist:
        for k in ("p10", "p25", "median", "p75", "p90"):
            print(f"  {k:>8}: {summary['mode_b'][k]:+.2f}")
        print(f"  EDM percentile rank: {b_pct:.0f}th")
    print()
    print("Top 5 Mode A alternatives that beat EDM:")
    for c in top_a[:5]:
        print(f"  +{c['season_value_xg']:>6.2f}  {c['skater']:25s}  +  {c['in_goalie']:20s} ↑↑ {c['out_goalie']}")
    print()
    print("Top 5 Mode B alternatives that beat EDM:")
    for c in top_b[:5]:
        names = " + ".join(c['players'])
        print(f"  +{c['season_value_xg']:>6.2f}  {names}")

    payload = {
        "meta": {
            "as_of": "2026-05-01",
            "budget_dollars": BUDGET,
            "tolerance_dollars": TOLERANCE,
            "n_samples_per_mode": N_SAMPLES,
            "expected_5v5_min_per_season": EXPECTED_5v5_MIN,
            "expected_sa_per_season": EXPECTED_SA,
            "pool_seasons": list(DEFAULT_POOL_SEASONS),
            "pool_filters": {
                "skater_aav_min": 800_000, "skater_aav_max": 5_000_000,
                "skater_min_toi": 200, "goalie_min_gp": 30,
            },
            "tweet_source": "John Cullen @cullenthecomic, 2026-04-30",
        },
        "actual_edm_choice": actual,
        "summary": summary,
        "mode_a_top10_beating_edm": top_a,
        "mode_b_top10_beating_edm": top_b,
        "mode_a_bottom5_random": bot_a,
        "mode_b_bottom5_random": bot_b,
        "mode_a_distribution": [m["season_value_xg"] for m in mode_a_values],
        "mode_b_distribution": [m["season_value_xg"] for m in mode_b_values],
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print()
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
