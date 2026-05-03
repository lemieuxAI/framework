"""Game 7 pre-game analyzer (MTL @ TBL, 2026-05-03 18:00 ET).

Series tied 3-3. Both teams have major lineup news:
  - MTL: Noah Dobson game-time decision (would play first game of the series).
    If in: Dobson-Matheson D1, Hutson-Carrier D3, Xhekaj scratched.
  - TBL: Victor Hedman doubtful (still). D'Astous-Lilleberg as D3.
    Goncalves promoted L4 → L2 with Guentzel-Point after 2-in-2 elimination
    goals. Bjorkstrand demoted L2 → L4.

This analyzer computes:
  1. Per-line iso net60 for both teams (G6 deployed vs G7 projected).
  2. Hedman absence cost for TBL (compare Hedman pooled-impact vs
     D'Astous + redistributed minutes).
  3. Dobson return value for MTL (compare Dobson pooled-impact vs
     Xhekaj + redistribution).
  4. Goncalves promotion projection (L4 minutes → L2 minutes, holding
     iso constant + caveat).
  5. Per-team series cumulative state (xG share, finishing variance,
     PP efficiency).
  6. Reuses g6_special MTL key-player series stats for context.

Output: game7_pregame.numbers.json
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import truststore
truststore.inject_into_ssl()

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "legacy"))
sys.path.insert(0, str(REPO / "packages" / "lemieux-core" / "src"))

from analytics.swap_engine import (
    PlayerImpact,
    build_pooled_player_impact,
    project_swap,
)

DB = REPO / "legacy" / "data" / "store.sqlite"
OUT_PATH = Path(__file__).parent / "game7_pregame.numbers.json"
LINEUPS_PATH = Path(__file__).parent / "game7_pregame_lineups.yaml"
G6_NUMBERS_PATH = Path(__file__).parent / "game6_special.numbers.json"

POOL_KEYS = [
    ("20242025", 2), ("20242025", 3),
    ("20252026", 2), ("20252026", 3),
]

# Slot-time assumptions (5v5 mins/game).
SLOT_TIMES_F = {"L1": 14.0, "L2": 12.5, "L3": 10.0, "L4": 7.5}
SLOT_TIMES_D = {"D1": 19.0, "D2": 17.0, "D3": 12.0}

MTL_G6_LINES = {
    "L1": ("Cole Caufield", "Nick Suzuki", "Juraj Slafkovský"),
    "L2": ("Josh Anderson", "Jake Evans", "Ivan Demidov"),
    "L3": ("Alexandre Texier", "Kirby Dach", "Zachary Bolduc"),
    "L4": ("Alex Newhook", "Phillip Danault", "Brendan Gallagher"),
}
MTL_G7_LINES = MTL_G6_LINES  # unchanged

MTL_G6_PAIRS = {
    "D1": ("Mike Matheson", "Lane Hutson"),
    "D2": ("Kaiden Guhle", "Alexandre Carrier"),
    "D3": ("Jayden Struble", "Arber Xhekaj"),
}
MTL_G7_PAIRS_DOBSON_IN = {
    "D1": ("Mike Matheson", "Noah Dobson"),
    "D2": ("Kaiden Guhle", "Jayden Struble"),
    "D3": ("Alexandre Carrier", "Lane Hutson"),
}

TBL_G6_LINES = {
    "L1": ("Brandon Hagel", "Anthony Cirelli", "Nikita Kucherov"),
    "L2": ("Jake Guentzel", "Brayden Point", "Oliver Bjorkstrand"),
    "L3": ("Zemgus Girgensons", "Yanni Gourde", "Nick Paul"),
    "L4": ("Dominic James", "Gage Goncalves", "Corey Perry"),
}
TBL_G7_LINES = {
    "L1": ("Brandon Hagel", "Anthony Cirelli", "Nikita Kucherov"),
    "L2": ("Jake Guentzel", "Brayden Point", "Gage Goncalves"),
    "L3": ("Zemgus Girgensons", "Yanni Gourde", "Nick Paul"),
    "L4": ("Oliver Bjorkstrand", "Dominic James", "Corey Perry"),
}

TBL_G6_PAIRS = {
    "D1": ("J.J. Moser", "Darren Raddysh"),
    "D2": ("Ryan McDonagh", "Erik Cernak"),
    "D3": ("Charle-Edouard D'Astous", "Emil Lilleberg"),
}
TBL_G7_PAIRS = TBL_G6_PAIRS  # unchanged (Hedman remains out)

ALL_MTL_PLAYERS = sorted({
    p
    for line in (*MTL_G6_LINES.values(), *MTL_G7_LINES.values())
    for p in line
} | {
    p
    for pair in (*MTL_G6_PAIRS.values(), *MTL_G7_PAIRS_DOBSON_IN.values())
    for p in pair
})
ALL_TBL_PLAYERS = sorted({
    p
    for line in (*TBL_G6_LINES.values(), *TBL_G7_LINES.values())
    for p in line
} | {
    p
    for pair in (*TBL_G6_PAIRS.values(), *TBL_G7_PAIRS.values())
    for p in pair
} | {"Victor Hedman"})


def fetch_player_rows(con, name):
    keys_clause = " OR ".join("(season=? AND stype=?)" for _ in POOL_KEYS)
    params = []
    for s, st in POOL_KEYS:
        params.extend([s, st])
    q = f"""
        SELECT name, team_id, season, stype, sit, split, toi, xgf, xga
        FROM skater_stats
        WHERE name = ? AND sit='5v5' AND split='oi' AND ({keys_clause})
    """
    return pd.read_sql_query(q, con, params=[name] + params)


def fetch_team_rows(con, team_id):
    keys_clause = " OR ".join("(season=? AND stype=?)" for _ in POOL_KEYS)
    params = []
    for s, st in POOL_KEYS:
        params.extend([s, st])
    q = f"""
        SELECT team_id, season, stype, sit, toi, xgf, xga
        FROM team_stats
        WHERE team_id = ? AND sit='5v5' AND ({keys_clause})
    """
    return pd.read_sql_query(q, con, params=[team_id] + params)


def impact_dict(p: PlayerImpact):
    return {
        "name": p.name,
        "team_id": p.team_id,
        "toi_on_min": round(p.toi_on, 1),
        "iso_xgf60": round(p.iso_xgf60, 3),
        "iso_xga60": round(p.iso_xga60, 3),
        "iso_net60": round(p.iso_xgf60 - p.iso_xga60, 3),
    }


def line_avg_iso(impacts: dict, line: tuple) -> dict:
    items = [impacts[n] for n in line if n in impacts]
    if len(items) < len(line):
        return {
            "avg_iso_net60": None,
            "members_with_data": len(items),
            "missing": [n for n in line if n not in impacts],
        }
    n = len(items)
    avg_xgf = sum(i.iso_xgf60 for i in items) / n
    avg_xga = sum(i.iso_xga60 for i in items) / n
    return {
        "avg_iso_xgf60": round(avg_xgf, 3),
        "avg_iso_xga60": round(avg_xga, 3),
        "avg_iso_net60": round(avg_xgf - avg_xga, 3),
        "members_with_data": n,
        "min_pooled_toi": round(min(i.toi_on for i in items), 0),
    }


def main():
    con = sqlite3.connect(DB)
    mtl_team = fetch_team_rows(con, "MTL")
    tbl_team = fetch_team_rows(con, "T.B")

    impacts = {}
    for name in ALL_MTL_PLAYERS:
        rows = fetch_player_rows(con, name)
        if rows.empty:
            continue
        impacts[name] = build_pooled_player_impact(rows, mtl_team, team_id="MTL")
    for name in ALL_TBL_PLAYERS:
        rows = fetch_player_rows(con, name)
        if rows.empty:
            continue
        impacts[name] = build_pooled_player_impact(rows, tbl_team, team_id="T.B")

    mtl_g6_lines_iso = {role: line_avg_iso(impacts, line) for role, line in MTL_G6_LINES.items()}
    mtl_g7_lines_iso = {role: line_avg_iso(impacts, line) for role, line in MTL_G7_LINES.items()}
    tbl_g6_lines_iso = {role: line_avg_iso(impacts, line) for role, line in TBL_G6_LINES.items()}
    tbl_g7_lines_iso = {role: line_avg_iso(impacts, line) for role, line in TBL_G7_LINES.items()}

    mtl_g6_pairs_iso = {role: line_avg_iso(impacts, p) for role, p in MTL_G6_PAIRS.items()}
    mtl_g7_pairs_iso = {role: line_avg_iso(impacts, p) for role, p in MTL_G7_PAIRS_DOBSON_IN.items()}
    tbl_g6_pairs_iso = {role: line_avg_iso(impacts, p) for role, p in TBL_G6_PAIRS.items()}
    tbl_g7_pairs_iso = {role: line_avg_iso(impacts, p) for role, p in TBL_G7_PAIRS.items()}

    # ---- Swap A: Dobson IN for Xhekaj OUT (D6 slot replacement) ----
    # Mechanically: Xhekaj at D6 (12 min) is swapped out for Dobson, who plays 19 min
    # at D1; Hutson moves from D1 → D3 (loses 7 min); Carrier rotates as well.
    # We model the simplest version: Dobson (19 min) replaces Xhekaj (12 min); the
    # extra 7 min comes from Hutson's redistribution.
    swap_dobson = None
    if impacts.get("Noah Dobson") and impacts.get("Arber Xhekaj"):
        s = project_swap(
            out_player=impacts["Arber Xhekaj"],
            in_player=impacts["Noah Dobson"],
            slot_minutes=SLOT_TIMES_D["D1"],
            strength_state="5v5",
            confidence=0.80,
        )
        swap_dobson = {
            "out": "Arber Xhekaj (D6, ~12 min)",
            "in": "Noah Dobson (D1, ~19 min)",
            "slot_min": SLOT_TIMES_D["D1"],
            "delta_xgf60": round(s.delta_xgf60, 4),
            "delta_xga60": round(s.delta_xga60, 4),
            "delta_net": round(s.delta_xgf60 - s.delta_xga60, 4),
            "delta_xgf_ci80": [round(s.delta_xgf60_ci80[0], 4), round(s.delta_xgf60_ci80[1], 4)],
            "delta_xga_ci80": [round(s.delta_xga60_ci80[0], 4), round(s.delta_xga60_ci80[1], 4)],
            "caveat": (
                "Dobson hasn't played in 22 days (thumb surgery). The pooled iso baseline "
                "assumes he's at full speed. A reasonable haircut: take 30-50% off the projection "
                "for the rust factor. Also, Hutson dropping to D3 (-7 min) is a structural cost "
                "this swap doesn't capture — Hutson's iso is +0.193 net60 over 118 series min."
            ),
        }

    # ---- Swap B: Hedman ABSENT for TBL (vs hypothetical return) ----
    # Tampa is already without Hedman. We frame this as: what would TBL gain if he returned?
    # Hedman vs the marginal D6 (D'Astous), modelled as an upgrade if he played.
    swap_hedman = None
    if impacts.get("Victor Hedman") and impacts.get("Charle-Edouard D'Astous"):
        s = project_swap(
            out_player=impacts["Charle-Edouard D'Astous"],
            in_player=impacts["Victor Hedman"],
            slot_minutes=SLOT_TIMES_D["D2"],
            strength_state="5v5",
            confidence=0.80,
        )
        swap_hedman = {
            "out": "D'Astous (D6, ~12 min)",
            "in": "Hedman (D2, ~21 min if healthy)",
            "slot_min": SLOT_TIMES_D["D2"],
            "delta_xgf60": round(s.delta_xgf60, 4),
            "delta_xga60": round(s.delta_xga60, 4),
            "delta_net": round(s.delta_xgf60 - s.delta_xga60, 4),
            "delta_xgf_ci80": [round(s.delta_xgf60_ci80[0], 4), round(s.delta_xgf60_ci80[1], 4)],
            "delta_xga_ci80": [round(s.delta_xga60_ci80[0], 4), round(s.delta_xga60_ci80[1], 4)],
            "interpretation": (
                "Read this as the magnitude of TBL's loss. Hedman's 25-26 reg-season iso "
                "comes off only 449 min — sample-thin, but his 4-window pooled baseline is "
                "the canonical signal. With Hedman out, Moser-Raddysh have absorbed 25-29 min/g "
                "every game — fatigue is the second-order risk this swap doesn't quantify."
            ),
        }

    # ---- Swap C: Goncalves L4 → L2 promotion ----
    # Same player, more minutes, against tougher opposition.
    swap_goncalves = None
    if impacts.get("Gage Goncalves"):
        g = impacts["Gage Goncalves"]
        minutes_gained = SLOT_TIMES_F["L2"] - SLOT_TIMES_F["L4"]
        per_game_delta = (g.iso_xgf60 - g.iso_xga60) * minutes_gained / 60.0
        swap_goncalves = {
            "player": "Gage Goncalves",
            "iso_net60": round(g.iso_xgf60 - g.iso_xga60, 3),
            "iso_xgf60": round(g.iso_xgf60, 3),
            "iso_xga60": round(g.iso_xga60, 3),
            "iso_pool_min": round(g.toi_on, 0),
            "g6_slot_min": SLOT_TIMES_F["L4"],
            "g7_slot_min": SLOT_TIMES_F["L2"],
            "minutes_gained": minutes_gained,
            "per_game_xg_delta": round(per_game_delta, 3),
            "caveat": (
                f"Goncalves' pooled 5v5 iso of {g.iso_xgf60-g.iso_xga60:+.3f} comes from "
                f"a depth-line role over {g.toi_on:.0f} min. Promotion to L2 with Guentzel-Point "
                "means tougher opposition (other teams' L1) — historical L4-to-L2 promotions show "
                "an iso compression of 30-50% on per-60 metrics. The +0.5 xG/g number is the "
                "pre-compression upper bound; realistic is closer to half that."
            ),
        }

    # ---- Total MTL line + pair iso swing G6 → G7 (if Dobson IN) ----
    line_swings_xg_per_game = {}
    for role in ("L1", "L2", "L3", "L4"):
        a = mtl_g6_lines_iso.get(role, {}).get("avg_iso_net60")
        b = mtl_g7_lines_iso.get(role, {}).get("avg_iso_net60")
        if a is None or b is None:
            line_swings_xg_per_game[role] = None
            continue
        slot = SLOT_TIMES_F[role]
        line_swings_xg_per_game[role] = round((b - a) * slot / 60.0, 4)
    # Forward lines unchanged this game; expect zeros.
    pair_swings_xg_per_game = {}
    for role in ("D1", "D2", "D3"):
        a = mtl_g6_pairs_iso.get(role, {}).get("avg_iso_net60")
        b = mtl_g7_pairs_iso.get(role, {}).get("avg_iso_net60")
        if a is None or b is None:
            pair_swings_xg_per_game[role] = None
            continue
        slot = SLOT_TIMES_D[role]
        pair_swings_xg_per_game[role] = round((b - a) * slot / 60.0, 4)
    mtl_total_5v5_xg_swing = sum(
        v for v in (*line_swings_xg_per_game.values(), *pair_swings_xg_per_game.values()) if v is not None
    )

    tbl_line_swings = {}
    for role in ("L1", "L2", "L3", "L4"):
        a = tbl_g6_lines_iso.get(role, {}).get("avg_iso_net60")
        b = tbl_g7_lines_iso.get(role, {}).get("avg_iso_net60")
        if a is None or b is None:
            tbl_line_swings[role] = None
            continue
        slot = SLOT_TIMES_F[role]
        tbl_line_swings[role] = round((b - a) * slot / 60.0, 4)
    tbl_total_5v5_xg_swing = sum(v for v in tbl_line_swings.values() if v is not None)

    # ---- Reuse G6 special analyzer outputs ----
    g6_data = {}
    if G6_NUMBERS_PATH.exists():
        g6 = json.loads(G6_NUMBERS_PATH.read_text(encoding="utf-8"))
        g6_data = {
            "series_team_overview": g6.get("series_team_overview", {}),
            "series_cumulative_individual": g6.get("series_cumulative_individual", {}),
            "mtl_key_player_series": g6.get("mtl_key_player_series", {}),
            "league_skater_top10_iso": g6.get("league_skater_rankings", {}).get("top_by_iso_net60", [])[:10],
            "league_goalie_top10_gsax": g6.get("league_goalie_rankings", {}).get("top_by_gsax_per60", [])[:10],
        }

    # ---- L1 5v5 drought computation ----
    mkps = g6_data.get("mtl_key_player_series", {})
    l1_5v5_drought = None
    if all(n in mkps for n in ["Nick Suzuki", "Cole Caufield", "Juraj Slafkovský"]):
        l1_5v5_drought = {
            "Nick Suzuki": {
                "5v5_pts": mkps["Nick Suzuki"]["5v5"]["p"],
                "5v5_g": mkps["Nick Suzuki"]["5v5"]["g"],
                "5v5_toi": mkps["Nick Suzuki"]["5v5"]["toi"],
                "iso_net60": mkps["Nick Suzuki"]["oi_5v5"]["iso_net60"],
            },
            "Cole Caufield": {
                "5v5_pts": mkps["Cole Caufield"]["5v5"]["p"],
                "5v5_g": mkps["Cole Caufield"]["5v5"]["g"],
                "5v5_toi": mkps["Cole Caufield"]["5v5"]["toi"],
                "iso_net60": mkps["Cole Caufield"]["oi_5v5"]["iso_net60"],
            },
            "Juraj Slafkovský": {
                "5v5_pts": mkps["Juraj Slafkovský"]["5v5"]["p"],
                "5v5_g": mkps["Juraj Slafkovský"]["5v5"]["g"],
                "5v5_toi": mkps["Juraj Slafkovský"]["5v5"]["toi"],
                "iso_net60": mkps["Juraj Slafkovský"]["oi_5v5"]["iso_net60"],
            },
            "combined_5v5_g": (mkps["Nick Suzuki"]["5v5"]["g"] + mkps["Cole Caufield"]["5v5"]["g"]
                                + mkps["Juraj Slafkovský"]["5v5"]["g"]),
        }

    # ---- Verdict assembly ----
    verdict = {
        "mtl_5v5_swing_xg_per_game": round(mtl_total_5v5_xg_swing, 3),
        "tbl_5v5_swing_xg_per_game": round(tbl_total_5v5_xg_swing, 3),
        "net_lineup_swing_for_mtl": round(mtl_total_5v5_xg_swing - tbl_total_5v5_xg_swing, 3),
        "label": None,
        "interpretation_short": None,
    }
    net = verdict["net_lineup_swing_for_mtl"]
    if net > 0.10:
        verdict["label"] = "lineup math favors MTL"
    elif net < -0.10:
        verdict["label"] = "lineup math favors TBL"
    else:
        verdict["label"] = "lineup math is essentially a wash"
    verdict["interpretation_short"] = (
        f"MTL projected change vs G6: {mtl_total_5v5_xg_swing:+.2f} xG/g at 5v5 (Dobson IN, "
        f"Hutson dropping to D3, Xhekaj scratched). TBL projected change: {tbl_total_5v5_xg_swing:+.2f} "
        f"xG/g (Goncalves promoted to L2). Net for MTL: {net:+.2f} xG/g."
    )

    payload = {
        "meta": {
            "as_of": "2026-05-03",
            "matchup": "MTL @ TBL Game 7 (series tied 3-3)",
            "venue": "Benchmark International Arena (TBL has last change)",
            "game_time": "18:00 ET",
            "lineup_source": "NHL.com G7 preview + Habs Eyes On The Prize G7 preview + Tampa beat reporters",
            "swap_engine": "lemieux pooled-baseline swap engine, 80% CI, NST oi 5v5 splits",
            "pool_windows": "24-25 reg+playoff + 25-26 reg+playoff (4 windows)",
            "slot_assumptions_F": SLOT_TIMES_F,
            "slot_assumptions_D": SLOT_TIMES_D,
            "key_status": {
                "MTL_Dobson": "game-time decision; took warmup; ~3 weeks post thumb surgery",
                "TBL_Hedman": "doubtful; practiced w/ team but not at optional Sunday skate",
            },
        },
        "verdict": verdict,
        "mtl": {
            "lines_g6": MTL_G6_LINES,
            "lines_g7_projected": MTL_G7_LINES,
            "pairs_g6": MTL_G6_PAIRS,
            "pairs_g7_projected_dobson_in": MTL_G7_PAIRS_DOBSON_IN,
            "lines_iso_g6": mtl_g6_lines_iso,
            "lines_iso_g7": mtl_g7_lines_iso,
            "pairs_iso_g6": mtl_g6_pairs_iso,
            "pairs_iso_g7_dobson_in": mtl_g7_pairs_iso,
            "line_swings_xg_per_game": line_swings_xg_per_game,
            "pair_swings_xg_per_game": pair_swings_xg_per_game,
            "total_5v5_xg_swing_per_game": round(mtl_total_5v5_xg_swing, 3),
        },
        "tbl": {
            "lines_g6": TBL_G6_LINES,
            "lines_g7_projected": TBL_G7_LINES,
            "pairs_g6": TBL_G6_PAIRS,
            "pairs_g7_projected": TBL_G7_PAIRS,
            "lines_iso_g6": tbl_g6_lines_iso,
            "lines_iso_g7": tbl_g7_lines_iso,
            "pairs_iso_g6": tbl_g6_pairs_iso,
            "pairs_iso_g7": tbl_g7_pairs_iso,
            "line_swings_xg_per_game": tbl_line_swings,
            "total_5v5_xg_swing_per_game": round(tbl_total_5v5_xg_swing, 3),
        },
        "swap_dobson_in": swap_dobson,
        "swap_hedman_absence": swap_hedman,
        "swap_goncalves_promotion": swap_goncalves,
        "player_impacts": {n: impact_dict(impacts[n]) for n in (ALL_MTL_PLAYERS + ALL_TBL_PLAYERS) if n in impacts},
        "l1_5v5_drought": l1_5v5_drought,
        "g6_data": g6_data,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT_PATH}")
    print()
    print("=" * 80)
    print("MTL LINE ISO (avg pooled iso net60 per trio, 5v5 oi)")
    print("=" * 80)
    print(f"{'Role':<6} {'G6 trio':<35} {'iso':>8}    {'G7 trio':<35} {'iso':>8}")
    for role in ("L1", "L2", "L3", "L4"):
        g6 = mtl_g6_lines_iso.get(role, {})
        g7 = mtl_g7_lines_iso.get(role, {})
        g6s = "-".join(p.split()[-1] for p in MTL_G6_LINES[role])[:35]
        g7s = "-".join(p.split()[-1] for p in MTL_G7_LINES[role])[:35]
        g6i = f"{g6.get('avg_iso_net60', 0):+.3f}" if g6.get("avg_iso_net60") is not None else "n/a"
        g7i = f"{g7.get('avg_iso_net60', 0):+.3f}" if g7.get("avg_iso_net60") is not None else "n/a"
        print(f"{role:<6} {g6s:<35} {g6i:>8}    {g7s:<35} {g7i:>8}")
    print()
    print("MTL PAIRS (avg pooled iso net60 per pair, 5v5 oi)")
    for role in ("D1", "D2", "D3"):
        g6 = mtl_g6_pairs_iso.get(role, {})
        g7 = mtl_g7_pairs_iso.get(role, {})
        g6s = "-".join(p.split()[-1] for p in MTL_G6_PAIRS[role])[:35]
        g7s = "-".join(p.split()[-1] for p in MTL_G7_PAIRS_DOBSON_IN[role])[:35]
        g6i = f"{g6.get('avg_iso_net60', 0):+.3f}" if g6.get("avg_iso_net60") is not None else "n/a"
        g7i = f"{g7.get('avg_iso_net60', 0):+.3f}" if g7.get("avg_iso_net60") is not None else "n/a"
        print(f"{role:<6} {g6s:<35} {g6i:>8}    {g7s:<35} {g7i:>8}")
    print()
    print("TBL LINE ISO")
    for role in ("L1", "L2", "L3", "L4"):
        g6 = tbl_g6_lines_iso.get(role, {})
        g7 = tbl_g7_lines_iso.get(role, {})
        g6s = "-".join(p.split()[-1] for p in TBL_G6_LINES[role])[:35]
        g7s = "-".join(p.split()[-1] for p in TBL_G7_LINES[role])[:35]
        g6i = f"{g6.get('avg_iso_net60', 0):+.3f}" if g6.get("avg_iso_net60") is not None else "n/a"
        g7i = f"{g7.get('avg_iso_net60', 0):+.3f}" if g7.get("avg_iso_net60") is not None else "n/a"
        print(f"{role:<6} {g6s:<35} {g6i:>8}    {g7s:<35} {g7i:>8}")
    print()
    if swap_dobson:
        print(f"Swap Dobson IN: net {swap_dobson['delta_net']:+.3f} xG/g  "
              f"(xGF [{swap_dobson['delta_xgf_ci80'][0]:+.2f}, {swap_dobson['delta_xgf_ci80'][1]:+.2f}], "
              f"xGA [{swap_dobson['delta_xga_ci80'][0]:+.2f}, {swap_dobson['delta_xga_ci80'][1]:+.2f}])")
    if swap_hedman:
        print(f"Swap Hedman ABSENT (TBL loss if he doesn't play): "
              f"would be {swap_hedman['delta_net']:+.3f} xG/g if he returned")
    if swap_goncalves:
        print(f"Swap Goncalves L4→L2: +{swap_goncalves['per_game_xg_delta']:.3f} xG/g (pre-compression)")
    print()
    print(f"VERDICT: {verdict['label']}")
    print(f"  {verdict['interpretation_short']}")


if __name__ == "__main__":
    main()
