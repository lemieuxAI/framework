"""AAV-constrained random combination sampler — for cap-efficiency studies.

Primitives:

  - sample_combinations(con, budget, *, n_samples, n_players_range, tolerance,
                         pool_filter, exclude) → list[tuple[str, ...]]
    Returns N tuples of player names whose AAVs sum to budget±tolerance.

  - sample_goalie_diff_combinations(con, budget, ..., n_samples) → list[dict]
    For "1 skater + 1 goalie upgrade" structures, where (in_goalie.aav -
    out_goalie.aav) + skater.aav ≈ budget. Returns dicts with
    {skater, in_goalie, out_goalie, total_cost}.

  - value_of_skater(con, name, *, expected_5v5_min_per_season=1000) → dict
    Pooled iso net60 across the 4-window pool, times the notional season-min.
    Reuses cohort_effects._pooled_iso_net.

  - value_of_goalie_diff(con, in_name, out_name, *, expected_sa_per_season=1500)
    (in.sv_pct - out.sv_pct) × expected_sa. Positive = upgrade.

The motivating use-case is the "McDavid-discount" study: did EDM use the $7M
McDavid extension-discount well, vs random combos summing to the same budget?
But the sampler is generic — works for any budget + any combination shape.

Pool filters by default exclude tiny-sample players (< 200 5v5 min pooled or
< 30 GP for goalies) so the value scores aren't garbage.
"""
from __future__ import annotations

import random
import sqlite3
from dataclasses import dataclass

from .cohort_effects import _pooled_iso_net


DEFAULT_POOL_SEASONS = ("20242025", "20252026")
DEFAULT_POOL_STYPES = (2, 3)
DEFAULT_MIN_SKATER_TOI = 200.0
DEFAULT_MIN_GOALIE_GP = 30


@dataclass
class SkaterValue:
    name: str
    aav: float
    position: str | None
    iso_net60: float
    pool_toi: float
    season_value_xg: float  # iso_net60 * expected_min / 60


@dataclass
class GoalieValueDiff:
    in_name: str
    out_name: str
    in_sv_pct: float
    out_sv_pct: float
    in_gp: int
    out_gp: int
    diff_sv_pct: float
    aav_cost: float           # in.aav - out.aav
    season_value_xg: float    # diff_sv_pct * expected_sa  (positive = upgrade)


# ---------- pool fetchers ----------

def fetch_skater_pool(con: sqlite3.Connection, *,
                     min_aav: float = 800_000, max_aav: float = 5_000_000,
                     min_toi: float = DEFAULT_MIN_SKATER_TOI,
                     positions: tuple[str, ...] = ("C", "L", "R", "D", "LW", "RW", "F"),
                     pool_seasons: tuple[str, ...] = DEFAULT_POOL_SEASONS,
                     ) -> list[dict]:
    """Return a list of skaters with AAV in range and stable iso baseline.

    Each entry has {name, aav, position, iso_net60, pool_toi}.
    """
    pos_clause = ",".join(["?"] * len(positions))
    rows = con.execute(f"""
        SELECT player_name, aav, position
        FROM player_contracts
        WHERE position IN ({pos_clause})
          AND aav BETWEEN ? AND ?
          AND aav IS NOT NULL
        ORDER BY player_name
    """, (*positions, min_aav, max_aav)).fetchall()

    out: list[dict] = []
    for name, aav, pos in rows:
        # The contract `position` field can be 'C, RW' etc. Pick the first.
        primary = (pos or "").split(",")[0].strip()
        # _pooled_iso_net expects a single position; query uses position match,
        # but for our use we accept any pooled iso. Try the primary first; if
        # zero TOI, retry without position filter via direct SQL.
        iso_net, toi = _pooled_iso_net(
            con, name, primary, pool_seasons, stype=2, sit="5v5"
        )
        # Add playoff toi too
        iso_net_p, toi_p = _pooled_iso_net(
            con, name, primary, pool_seasons, stype=3, sit="5v5"
        )
        # If position filter excluded everything, fall back to no-position-filter
        if (toi + toi_p) <= 0:
            r = con.execute("""
                SELECT SUM(toi), SUM(xgf), SUM(xga)
                FROM skater_stats
                WHERE name=? AND sit='5v5' AND split='oi'
                  AND season IN (?, ?) AND stype IN (2,3)
            """, (name, pool_seasons[0], pool_seasons[1] if len(pool_seasons) > 1 else pool_seasons[0])).fetchone()
            if r and r[0] and r[0] > 0:
                p_toi, p_xgf, p_xga = r
                # pool team rows for the same window
                tr = con.execute("""
                    SELECT SUM(toi), SUM(xgf), SUM(xga)
                    FROM team_stats
                    WHERE sit='5v5' AND season IN (?, ?) AND stype IN (2,3)
                """, (pool_seasons[0], pool_seasons[1] if len(pool_seasons) > 1 else pool_seasons[0])).fetchone()
                if tr and tr[0]:
                    t_toi, t_xgf, t_xga = tr
                    toi_off = max(t_toi - p_toi, 1.0)
                    xgf_off = max(t_xgf - p_xgf, 0.0)
                    xga_off = max(t_xga - p_xga, 0.0)
                    iso_xgf60 = (p_xgf * 60.0 / p_toi) - (xgf_off * 60.0 / toi_off)
                    iso_xga60 = (p_xga * 60.0 / p_toi) - (xga_off * 60.0 / toi_off)
                    iso_net = iso_xgf60 - iso_xga60
                    toi = p_toi
                    toi_p = 0
        total_toi = toi + toi_p
        if total_toi < min_toi:
            continue
        out.append({
            "name": name, "aav": float(aav), "position": primary,
            "iso_net60": float(iso_net), "pool_toi": float(total_toi),
        })
    return out


def fetch_goalie_pool(con: sqlite3.Connection, *,
                     min_gp: int = DEFAULT_MIN_GOALIE_GP,
                     pool_seasons: tuple[str, ...] = DEFAULT_POOL_SEASONS,
                     ) -> list[dict]:
    """Return goalies with AAV + pooled SV% across reg + playoff windows.

    Each entry has {name, aav, sv_pct, gp, sa, ga}.
    """
    season_ph = ",".join(["?"] * len(pool_seasons))
    season_params = list(pool_seasons)
    rows = con.execute(f"""
        SELECT pc.player_name, pc.aav,
               (SELECT SUM(gs.sa) FROM goalie_stats gs WHERE gs.name = pc.player_name
                  AND gs.season IN ({season_ph}) AND gs.stype IN (2,3) AND gs.sit='all') AS sa,
               (SELECT SUM(gs.ga) FROM goalie_stats gs WHERE gs.name = pc.player_name
                  AND gs.season IN ({season_ph}) AND gs.stype IN (2,3) AND gs.sit='all') AS ga,
               (SELECT SUM(gs.gp) FROM goalie_stats gs WHERE gs.name = pc.player_name
                  AND gs.season IN ({season_ph}) AND gs.stype IN (2,3) AND gs.sit='all') AS gp
        FROM player_contracts pc
        WHERE pc.position = 'G' AND pc.aav IS NOT NULL
    """, season_params * 3).fetchall()
    out: list[dict] = []
    for name, aav, sa, ga, gp in rows:
        if not sa or sa <= 0 or not gp or gp < min_gp:
            continue
        sv_pct = 1.0 - (ga / sa)
        out.append({
            "name": name, "aav": float(aav), "sv_pct": float(sv_pct),
            "gp": int(gp), "sa": int(sa), "ga": int(ga or 0),
        })
    return out


# ---------- value functions ----------

def value_of_skater(con: sqlite3.Connection, name: str, *,
                    expected_5v5_min_per_season: float = 1000.0,
                    pool_seasons: tuple[str, ...] = DEFAULT_POOL_SEASONS,
                    ) -> SkaterValue:
    """Pooled iso net60 × notional 1000 5v5 min/season. Higher = more positive impact."""
    # Fetch position from contracts
    r = con.execute(
        "SELECT aav, position FROM player_contracts WHERE player_name = ?", (name,)
    ).fetchone()
    aav, pos = (r[0], (r[1] or "").split(",")[0].strip()) if r else (None, None)
    iso_reg, toi_reg = _pooled_iso_net(con, name, pos or "", pool_seasons, stype=2, sit="5v5")
    iso_play, toi_play = _pooled_iso_net(con, name, pos or "", pool_seasons, stype=3, sit="5v5")
    # Weighted by TOI
    total_toi = toi_reg + toi_play
    if total_toi > 0:
        iso_net = (iso_reg * toi_reg + iso_play * toi_play) / total_toi
    else:
        iso_net = 0.0
    return SkaterValue(
        name=name, aav=float(aav) if aav is not None else 0.0,
        position=pos,
        iso_net60=float(iso_net),
        pool_toi=float(total_toi),
        season_value_xg=float(iso_net * expected_5v5_min_per_season / 60.0),
    )


def value_of_goalie_diff(con: sqlite3.Connection, in_name: str, out_name: str, *,
                         expected_sa_per_season: float = 1500.0,
                         pool_seasons: tuple[str, ...] = DEFAULT_POOL_SEASONS,
                         ) -> GoalieValueDiff:
    """Save-percentage upgrade × expected season SA. Positive = better goalie in."""
    season_ph = ",".join(["?"] * len(pool_seasons))
    season_params = list(pool_seasons)
    def _g(name: str):
        r = con.execute(f"""
            SELECT
              (SELECT SUM(sa) FROM goalie_stats
                 WHERE name=? AND season IN ({season_ph}) AND stype IN (2,3) AND sit='all'),
              (SELECT SUM(ga) FROM goalie_stats
                 WHERE name=? AND season IN ({season_ph}) AND stype IN (2,3) AND sit='all'),
              (SELECT SUM(gp) FROM goalie_stats
                 WHERE name=? AND season IN ({season_ph}) AND stype IN (2,3) AND sit='all')
        """, [name] + season_params + [name] + season_params + [name] + season_params).fetchone()
        sa, ga, gp = r
        sv = (1.0 - (ga / sa)) if sa and sa > 0 else 0.0
        return float(sv), int(gp or 0)
    in_sv, in_gp = _g(in_name)
    out_sv, out_gp = _g(out_name)
    in_aav_r = con.execute("SELECT aav FROM player_contracts WHERE player_name=?", (in_name,)).fetchone()
    out_aav_r = con.execute("SELECT aav FROM player_contracts WHERE player_name=?", (out_name,)).fetchone()
    in_aav = float(in_aav_r[0]) if in_aav_r and in_aav_r[0] else 0.0
    out_aav = float(out_aav_r[0]) if out_aav_r and out_aav_r[0] else 0.0
    diff = in_sv - out_sv
    return GoalieValueDiff(
        in_name=in_name, out_name=out_name,
        in_sv_pct=in_sv, out_sv_pct=out_sv,
        in_gp=in_gp, out_gp=out_gp,
        diff_sv_pct=diff,
        aav_cost=in_aav - out_aav,
        season_value_xg=diff * expected_sa_per_season,
    )


# ---------- combination samplers ----------

def sample_combinations(
    con: sqlite3.Connection,
    budget: float,
    *,
    n_samples: int = 2000,
    n_players_range: tuple[int, int] = (1, 3),
    tolerance: float = 300_000.0,
    pool: list[dict] | None = None,
    exclude: tuple[str, ...] = (),
    seed: int = 42,
    max_attempts_per_sample: int = 200,
) -> list[tuple[str, ...]]:
    """Random combinations of skaters whose AAVs sum to budget ± tolerance.

    Each combination is between n_players_range[0] and n_players_range[1] players
    (default 1-3). The sampler is uniform over (size, picked_set) — not over
    sums — so smaller sums and larger sums are both possible. We reject any
    sample outside the tolerance window.

    `pool` is a list of dicts as returned by fetch_skater_pool(). If None,
    the function fetches a default pool.

    Returns up to n_samples tuples of player names. May return fewer if the
    budget tolerance is too tight.
    """
    rng = random.Random(seed)
    if pool is None:
        pool = fetch_skater_pool(con)
    pool = [p for p in pool if p["name"] not in exclude]
    if not pool:
        return []

    out: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    attempts = 0
    max_total_attempts = n_samples * max_attempts_per_sample

    while len(out) < n_samples and attempts < max_total_attempts:
        attempts += 1
        size = rng.randint(n_players_range[0], n_players_range[1])
        if size > len(pool):
            size = len(pool)
        picked = rng.sample(pool, size)
        total = sum(p["aav"] for p in picked)
        if abs(total - budget) <= tolerance:
            key = tuple(sorted(p["name"] for p in picked))
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
    return out


def sample_goalie_diff_combinations(
    con: sqlite3.Connection,
    budget: float,
    *,
    n_samples: int = 2000,
    tolerance: float = 300_000.0,
    skater_pool: list[dict] | None = None,
    goalie_pool: list[dict] | None = None,
    exclude_skaters: tuple[str, ...] = (),
    exclude_goalies: tuple[str, ...] = (),
    seed: int = 42,
    max_attempts: int = 400_000,
) -> list[dict]:
    """Sample (skater + goalie-upgrade) combinations summing to budget±tolerance.

    Each sample is {'skater': name, 'in_goalie': name, 'out_goalie': name,
    'skater_aav': $, 'goalie_diff_aav': $, 'total_cost': $}.

    The 'goalie_diff_aav' = (in_goalie.aav - out_goalie.aav). Total cost =
    skater.aav + goalie_diff_aav.
    """
    rng = random.Random(seed)
    if skater_pool is None:
        skater_pool = fetch_skater_pool(con)
    if goalie_pool is None:
        goalie_pool = fetch_goalie_pool(con)
    skater_pool = [p for p in skater_pool if p["name"] not in exclude_skaters]
    goalie_pool = [g for g in goalie_pool if g["name"] not in exclude_goalies]
    if not skater_pool or len(goalie_pool) < 2:
        return []

    out: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    attempts = 0
    while len(out) < n_samples and attempts < max_attempts:
        attempts += 1
        skater = rng.choice(skater_pool)
        in_g, out_g = rng.sample(goalie_pool, 2)
        diff_aav = in_g["aav"] - out_g["aav"]
        total = skater["aav"] + diff_aav
        if abs(total - budget) <= tolerance:
            key = (skater["name"], in_g["name"], out_g["name"])
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "skater": skater["name"],
                "in_goalie": in_g["name"], "out_goalie": out_g["name"],
                "skater_aav": skater["aav"],
                "goalie_diff_aav": diff_aav,
                "total_cost": total,
            })
    return out
