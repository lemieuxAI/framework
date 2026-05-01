"""The Cullen-McDavid question — RIGOROUS VERSION.

Premise (from John Cullen tweet, 2026-04-30):
  McDavid took ~$7M under market value on his extension.
  Bowman spent that money on:
    - Trent Frederic (full AAV)
    - The cap-hit difference between Stuart Skinner (out) and Tristan Jarry (in)

Total: Frederic ($3.85M) + (Jarry $5.375M − Skinner $2.6M) = $6.625M.

This rigorous analyzer:
  1. Uses GSAx (goals saved above expected) for goalie value — accounts for
     shot quality, not just save rate. Δ GSAx/60 × reference TOI.
  2. Uses pooled iso net60 × per-player projected 5v5 deployment for skaters.
     Each player gets their own min-projection from 25-26 reg-season usage.
  3. Propagates Poisson variance on both sides → 80% CI on the final value.
  4. Samples 2 000 random combinations with the same rigorous scoring.
  5. Reports percentile rank + the CI sensitivity at multiple deployment refs.

Output: cullen_mcdavid_question.numbers.json
"""
from __future__ import annotations

import json
import math
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
    value_of_goalie_diff_gsax,
    value_of_skater,
)

DB = REPO / "legacy" / "data" / "store.sqlite"
OUT = Path(__file__).parent / "cullen_mcdavid_question.numbers.json"

BUDGET = 6_625_000.0
TOLERANCE = 300_000.0
N_SAMPLES = 2000
GOALIE_REF_TOI = 3000.0   # ~55 GP, 1A-in-tandem starter equivalent
GOALIE_MIN_GP_FOR_POOL = 50  # tighter than v1 (was 30) — GSAx noise is real


def actual_edm_value(con: sqlite3.Connection) -> dict:
    """EDM's actual choice with rigorous metrics + variance."""
    skater = value_of_skater(
        con, "Trent Frederic", use_projected_deployment=True,
    )
    goalie = value_of_goalie_diff_gsax(
        con, "Tristan Jarry", "Stuart Skinner",
        reference_toi=GOALIE_REF_TOI,
    )
    total_value = skater.season_value_xg + goalie.season_value_xg
    # Variance propagation: independent components, sum variances
    total_se = math.sqrt(skater.season_value_se ** 2 + goalie.season_value_se ** 2)
    z80 = 1.282
    total_cost = skater.aav + goalie.aav_cost
    return {
        "skater_name": skater.name,
        "skater_aav": skater.aav,
        "skater_iso_net60": skater.iso_net60,
        "skater_pool_toi": skater.pool_toi,
        "skater_projected_5v5_min": skater.projected_5v5_min_per_season,
        "skater_season_value_xg": skater.season_value_xg,
        "skater_season_value_se": skater.season_value_se,

        "in_goalie": goalie.in_name, "out_goalie": goalie.out_name,
        "in_gsax_per_60": goalie.in_gsax_per_60,
        "out_gsax_per_60": goalie.out_gsax_per_60,
        "in_toi": goalie.in_toi, "out_toi": goalie.out_toi,
        "in_ga": goalie.in_ga, "out_ga": goalie.out_ga,
        "diff_gsax_per_60": goalie.diff_gsax_per_60,
        "goalie_aav_cost": goalie.aav_cost,
        "goalie_reference_toi": goalie.reference_toi,
        "goalie_season_value_xg": goalie.season_value_xg,
        "goalie_season_value_se": goalie.season_value_se,

        "total_cost": total_cost,
        "total_value_xg": total_value,
        "total_value_se": total_se,
        "total_value_ci80_low": total_value - z80 * total_se,
        "total_value_ci80_high": total_value + z80 * total_se,

        # Pull SV%/save_pct anchors for the prose context
        "in_sv_pct": (1.0 - goalie.in_ga / max(goalie.in_toi, 1) * 0) if False else None,
    }


def goalie_sensitivity(con: sqlite3.Connection) -> dict:
    """How does the goalie verdict scale with the deployment assumption?"""
    out = {}
    for ref in (1500, 2000, 2500, 3000, 3500):
        g = value_of_goalie_diff_gsax(
            con, "Tristan Jarry", "Stuart Skinner", reference_toi=ref,
        )
        out[ref] = {
            "season_value_xg": g.season_value_xg,
            "season_value_se": g.season_value_se,
            "ci80": [g.season_value_xg - 1.282 * g.season_value_se,
                     g.season_value_xg + 1.282 * g.season_value_se],
        }
    return out


def evaluate_skater_combo(con: sqlite3.Connection, names: tuple[str, ...]) -> dict:
    """Sum value + propagate variance across multiple skaters."""
    total = 0.0
    var = 0.0
    for n in names:
        v = value_of_skater(con, n, use_projected_deployment=True)
        total += v.season_value_xg
        var += v.season_value_se ** 2
    return {"value": total, "se": math.sqrt(var)}


def evaluate_goalie_combo(con: sqlite3.Connection, combo: dict) -> dict:
    s = value_of_skater(con, combo["skater"], use_projected_deployment=True)
    g = value_of_goalie_diff_gsax(
        con, combo["in_goalie"], combo["out_goalie"], reference_toi=GOALIE_REF_TOI,
    )
    return {
        "value": s.season_value_xg + g.season_value_xg,
        "se": math.sqrt(s.season_value_se ** 2 + g.season_value_se ** 2),
    }


def percentile_of(value: float, distribution: list[float]) -> float:
    if not distribution:
        return float("nan")
    arr = np.asarray(distribution)
    return float((arr < value).sum() / len(arr) * 100)


def main():
    con = sqlite3.connect(DB)

    print("=" * 80)
    print("CULLEN-McDAVID QUESTION — RIGOROUS VERSION (GSAx + projected deployment + 80% CI)")
    print("=" * 80)
    print()

    actual = actual_edm_value(con)
    print(f"Actual EDM choice (Frederic + Jarry-for-Skinner):")
    print(f"  Frederic:")
    print(f"    AAV=${actual['skater_aav']:>11,.0f}  iso_net60={actual['skater_iso_net60']:+.3f}")
    print(f"    Pool TOI={actual['skater_pool_toi']:.0f} min   Projected 25-26 deployment={actual['skater_projected_5v5_min']:.0f} 5v5 min")
    print(f"    season_value = {actual['skater_season_value_xg']:+.2f} ± {actual['skater_season_value_se']:.2f} xG")
    print()
    print(f"  Goalie diff (Jarry IN, Skinner OUT) [ref TOI = {GOALIE_REF_TOI:.0f}]:")
    print(f"    Jarry GSAx/60={actual['in_gsax_per_60']:+.3f}  pool_toi={actual['in_toi']:.0f}  GA={actual['in_ga']}")
    print(f"    Skinner GSAx/60={actual['out_gsax_per_60']:+.3f}  pool_toi={actual['out_toi']:.0f}  GA={actual['out_ga']}")
    print(f"    Diff GSAx/60: {actual['diff_gsax_per_60']:+.3f}")
    print(f"    season_value = {actual['goalie_season_value_xg']:+.2f} ± {actual['goalie_season_value_se']:.2f} xG")
    print()
    print(f"  TOTAL: {actual['total_value_xg']:+.2f} ± {actual['total_value_se']:.2f} xG/season")
    print(f"  80% CI: [{actual['total_value_ci80_low']:+.2f}, {actual['total_value_ci80_high']:+.2f}]")
    if actual['total_value_ci80_high'] > 0 and actual['total_value_ci80_low'] < 0:
        print("  → CI straddles zero — directional but not statistically clean")
    elif actual['total_value_ci80_high'] < 0:
        print("  → CI excludes zero (negative) — high-confidence loss")
    else:
        print("  → CI excludes zero (positive) — high-confidence gain")
    print()

    print("Goalie deployment sensitivity:")
    sens = goalie_sensitivity(con)
    for ref, v in sens.items():
        print(f"  ref_toi={ref}: {v['season_value_xg']:+.2f} ± {v['season_value_se']:.2f} (80% CI [{v['ci80'][0]:+.2f}, {v['ci80'][1]:+.2f}])")
    print()

    print("Building pools…")
    skater_pool = fetch_skater_pool(con,
                                     min_aav=800_000, max_aav=5_000_000,
                                     min_toi=200,
                                     pool_seasons=DEFAULT_POOL_SEASONS)
    goalie_pool = fetch_goalie_pool(con,
                                     min_gp=GOALIE_MIN_GP_FOR_POOL,
                                     pool_seasons=DEFAULT_POOL_SEASONS)
    print(f"  skater pool: {len(skater_pool)} players  (AAV $0.8M-$5M, ≥200 min 5v5 pooled)")
    print(f"  goalie pool: {len(goalie_pool)} goalies  (≥{GOALIE_MIN_GP_FOR_POOL} GP pooled)")
    print()

    # Mode A — like-for-like (skater + goalie GSAx diff)
    print(f"Sampling Mode A…  budget=${BUDGET:,.0f} ±${TOLERANCE:,.0f}")
    mode_a_combos = sample_goalie_diff_combinations(
        con, budget=BUDGET, tolerance=TOLERANCE,
        n_samples=N_SAMPLES,
        skater_pool=skater_pool, goalie_pool=goalie_pool,
        exclude_skaters=("Trent Frederic",),
        exclude_goalies=("Stuart Skinner", "Tristan Jarry"),
    )
    mode_a_values = []
    for c in mode_a_combos:
        ev = evaluate_goalie_combo(con, c)
        mode_a_values.append({**c,
                              "season_value_xg": ev["value"],
                              "season_value_se": ev["se"]})
    a_dist = [m["season_value_xg"] for m in mode_a_values]
    print(f"  found {len(mode_a_values)} combos")

    # Mode B — pure skaters
    print(f"Sampling Mode B…")
    mode_b_combos = sample_combinations(
        con, budget=BUDGET, tolerance=TOLERANCE,
        n_samples=N_SAMPLES, n_players_range=(1, 3),
        pool=skater_pool,
        exclude=("Trent Frederic",),
    )
    mode_b_values = []
    for combo in mode_b_combos:
        ev = evaluate_skater_combo(con, combo)
        total_aav = sum(p["aav"] for p in skater_pool if p["name"] in combo)
        mode_b_values.append({"players": list(combo), "total_aav": total_aav,
                              "season_value_xg": ev["value"],
                              "season_value_se": ev["se"]})
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
        "actual_edm_se": actual["total_value_se"],
        "actual_edm_ci80": [actual["total_value_ci80_low"], actual["total_value_ci80_high"]],
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

    top_a = sorted(mode_a_values, key=lambda m: -m["season_value_xg"])[:10]
    top_b = sorted(mode_b_values, key=lambda m: -m["season_value_xg"])[:10]
    bot_a = sorted(mode_a_values, key=lambda m: m["season_value_xg"])[:5]
    bot_b = sorted(mode_b_values, key=lambda m: m["season_value_xg"])[:5]

    print(f"Actual EDM: {actual_v:+.2f} ± {actual['total_value_se']:.2f}  (80% CI [{actual['total_value_ci80_low']:+.2f}, {actual['total_value_ci80_high']:+.2f}])")
    print()
    print("MODE A summary:")
    if a_dist:
        for k in ("p10", "p25", "median", "p75", "p90"):
            print(f"  {k:>8}: {summary['mode_a'][k]:+.2f}")
        print(f"  EDM percentile rank: {a_pct:.0f}th")
    print()
    print("MODE B summary:")
    if b_dist:
        for k in ("p10", "p25", "median", "p75", "p90"):
            print(f"  {k:>8}: {summary['mode_b'][k]:+.2f}")
        print(f"  EDM percentile rank: {b_pct:.0f}th")
    print()
    print("Top 5 Mode A:")
    for c in top_a[:5]:
        print(f"  {c['season_value_xg']:>+7.2f} ± {c['season_value_se']:.2f}  {c['skater']:25s}  +  {c['in_goalie']:20s} ↑↑ {c['out_goalie']}")
    print()
    print("Top 5 Mode B:")
    for c in top_b[:5]:
        print(f"  {c['season_value_xg']:>+7.2f} ± {c['season_value_se']:.2f}  {' + '.join(c['players'])}")

    payload = {
        "meta": {
            "as_of": "2026-05-01",
            "version": "rigorous v2 — GSAx, projected deployment, 80% CI",
            "budget_dollars": BUDGET,
            "tolerance_dollars": TOLERANCE,
            "n_samples_per_mode": N_SAMPLES,
            "goalie_reference_toi": GOALIE_REF_TOI,
            "goalie_min_gp_for_pool": GOALIE_MIN_GP_FOR_POOL,
            "pool_seasons": list(DEFAULT_POOL_SEASONS),
            "pool_filters": {
                "skater_aav_min": 800_000, "skater_aav_max": 5_000_000,
                "skater_min_toi": 200, "goalie_min_gp": GOALIE_MIN_GP_FOR_POOL,
            },
            "methodology_notes": [
                "Skater value = iso_net60 × projected 25-26 5v5 min/season (player-specific, capped 300-1500).",
                "Goalie value = (in.GSAx/60 - out.GSAx/60) × reference TOI (3000 ≈ 55 GP starter).",
                "Variance: Poisson approx on xGF/xGA (skaters) and GA (goalies). Combined SE = sqrt(sum of variances).",
                "80% CI = mean ± 1.282 × SE. Assumes independence between skater and goalie components.",
                "Honest limitation: no shot-quality adjustment for skaters beyond what xGF/xGA already captures; no role/chemistry/age modeling.",
            ],
            "tweet_source": "John Cullen @cullenthecomic, 2026-04-30",
        },
        "actual_edm_choice": actual,
        "goalie_sensitivity_by_ref_toi": sens,
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
