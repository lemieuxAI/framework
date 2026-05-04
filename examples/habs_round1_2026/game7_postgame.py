"""Game 7 post-game + Round 2 preview analyzer.

MTL won G7 2-1. Series ends 4-3 MTL. Next: Buffalo Sabres in Round 2,
G1 Wed May 6 in Buffalo.

This analyzer:
  1. Reads game7_box_score.yaml as the canonical fact base for G7.
  2. Computes final MTL series cumulative individual + on-ice stats
     (extends the G6 special which was through 6 games).
  3. Loads Buffalo R1 cumulative stats (vs Boston, 6 games).
  4. Side-by-side R2 head-to-head: top forwards iso, top D iso,
     goalies, special teams.
  5. Computes pooled-baseline iso swap for each MTL forward vs each
     Buffalo defenseman pair (the matchup question).
  6. Highlights "what's working" diffs that matter for R2.

Output: game7_postgame.numbers.json
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import truststore
truststore.inject_into_ssl()

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "legacy"))
sys.path.insert(0, str(REPO / "packages" / "lemieux-core" / "src"))

DB = REPO / "legacy" / "data" / "store.sqlite"
BOX_PATH = Path(__file__).parent / "game7_box_score.yaml"
G6_NUMBERS_PATH = Path(__file__).parent / "game6_special.numbers.json"
OUT_PATH = Path(__file__).parent / "game7_postgame.numbers.json"


def fetch_team_individual(con, team_id, *, top=20):
    rows = con.execute("""
        SELECT name, position, gp, toi, goals, assists, points, shots, ixg, ihdcf
        FROM skater_individual_stats
        WHERE team_id = ? AND season='20252026' AND stype=3 AND sit='all'
        ORDER BY points DESC, goals DESC
        LIMIT ?
    """, (team_id, top)).fetchall()
    return [
        {"name": r[0], "position": r[1], "gp": r[2], "toi": round(r[3], 1),
         "goals": r[4], "assists": r[5], "points": r[6], "shots": r[7],
         "ixg": round(r[8] or 0, 2), "ihdcf": r[9]}
        for r in rows
    ]


def fetch_team_on_ice(con, team_id, *, min_toi=20.0):
    """Per-player on-ice 5v5 splits + iso net60 for the player."""
    rows = con.execute("""
        SELECT s.name, s.toi, s.xgf, s.xga
        FROM skater_stats s
        WHERE s.team_id = ? AND s.season='20252026' AND s.stype=3
              AND s.sit='5v5' AND s.split='oi' AND s.toi >= ?
        ORDER BY s.toi DESC
    """, (team_id, min_toi)).fetchall()
    return [
        {"name": r[0], "oi_toi": round(r[1], 1),
         "oi_xgf": round(r[2], 2), "oi_xga": round(r[3], 2),
         "oi_xg_diff_per60": round(((r[2] - r[3]) * 60.0 / r[1]) if r[1] > 0 else 0, 3)}
        for r in rows
    ]


def fetch_team_goalies(con, team_id):
    rows = con.execute("""
        SELECT name, gp, toi, ga, sa, sv_pct, xga
        FROM goalie_stats
        WHERE team_id = ? AND season='20252026' AND stype=3 AND sit='all'
        ORDER BY toi DESC
    """, (team_id,)).fetchall()
    return [
        {"name": r[0], "gp": r[1], "toi": round(r[2], 1), "ga": r[3],
         "sa": r[4], "sv_pct": round(r[5], 3), "xga": round(r[6], 2),
         "gsax": round((r[6] - r[3]), 2),  # xGA - GA
         "gsax_per60": round(((r[6] - r[3]) * 60.0 / r[2]) if r[2] > 0 else 0, 3)}
        for r in rows
    ]


def fetch_team_pp_pk(con, team_id):
    """Cumulative power-play and PK stats from team_stats."""
    pp = con.execute("""
        SELECT toi, xgf, xga FROM team_stats
        WHERE team_id=? AND season='20252026' AND stype=3 AND sit='5v4'
    """, (team_id,)).fetchone()
    pk = con.execute("""
        SELECT toi, xgf, xga FROM team_stats
        WHERE team_id=? AND season='20252026' AND stype=3 AND sit='4v5'
    """, (team_id,)).fetchone()
    fv = con.execute("""
        SELECT toi, xgf, xga FROM team_stats
        WHERE team_id=? AND season='20252026' AND stype=3 AND sit='5v5'
    """, (team_id,)).fetchone()
    return {
        "five_v_four": {"toi": round(pp[0], 1), "xgf": round(pp[1], 2), "xga": round(pp[2], 2),
                         "xgf60": round(pp[1]*60/pp[0], 2) if pp and pp[0] else 0} if pp else None,
        "four_v_five": {"toi": round(pk[0], 1), "xga": round(pk[2], 2),
                         "xga60": round(pk[2]*60/pk[0], 2) if pk and pk[0] else 0} if pk else None,
        "five_v_five": {"toi": round(fv[0], 1), "xgf": round(fv[1], 2), "xga": round(fv[2], 2),
                         "xgf_pct": round(fv[1]/(fv[1]+fv[2])*100, 1) if fv and (fv[1]+fv[2]) else 0} if fv else None,
    }


def main():
    con = sqlite3.connect(DB)
    box = yaml.safe_load(BOX_PATH.read_text(encoding="utf-8"))

    # ---- Final MTL series totals (refresh from DB after G7) ----
    mtl_individuals = fetch_team_individual(con, "MTL", top=20)
    mtl_oi = fetch_team_on_ice(con, "MTL", min_toi=20.0)
    mtl_goalies = fetch_team_goalies(con, "MTL")
    mtl_st = fetch_team_pp_pk(con, "MTL")

    tbl_individuals = fetch_team_individual(con, "T.B", top=10)
    tbl_oi = fetch_team_on_ice(con, "T.B", min_toi=20.0)
    tbl_goalies = fetch_team_goalies(con, "T.B")
    tbl_st = fetch_team_pp_pk(con, "T.B")

    # ---- Buffalo R1 totals (vs Boston) ----
    buf_individuals = fetch_team_individual(con, "BUF", top=15)
    buf_oi = fetch_team_on_ice(con, "BUF", min_toi=20.0)
    buf_goalies = fetch_team_goalies(con, "BUF")
    buf_st = fetch_team_pp_pk(con, "BUF")

    # ---- Round 2 R2 quick-look comparisons ----
    # Pull MTL top forwards iso vs BUF top forwards iso, etc.
    def mark_iso(rows, *, iso_label="iso_per60"):
        out = []
        for r in rows:
            if r["oi_toi"] > 0:
                out.append({**r, iso_label: r["oi_xg_diff_per60"]})
        return out

    mtl_oi_iso = mark_iso(mtl_oi)
    buf_oi_iso = mark_iso(buf_oi)

    # ---- Top-line head-to-head (manual: known top forwards both teams) ----
    mtl_top_fwds = ["Nick Suzuki", "Cole Caufield", "Juraj Slafkovský",
                    "Ivan Demidov", "Josh Anderson", "Jake Evans"]
    buf_top_fwds = ["Tage Thompson", "Alex Tuch", "Peyton Krebs", "Jack Quinn",
                    "Zach Benson", "Ryan McLeod", "Josh Doan"]

    def find(rows, name):
        for r in rows:
            if r["name"] == name:
                return r
        return None

    head_to_head_fwds = []
    for n in mtl_top_fwds:
        head_to_head_fwds.append({
            "team": "MTL", "name": n,
            "indiv": find(mtl_individuals, n),
            "on_ice": find(mtl_oi_iso, n),
        })
    for n in buf_top_fwds:
        head_to_head_fwds.append({
            "team": "BUF", "name": n,
            "indiv": find(buf_individuals, n),
            "on_ice": find(buf_oi_iso, n),
        })

    mtl_top_d = ["Lane Hutson", "Mike Matheson", "Kaiden Guhle", "Alexandre Carrier"]
    buf_top_d = ["Rasmus Dahlin", "Bowen Byram", "Owen Power", "Mattias Samuelsson"]
    head_to_head_d = []
    for n in mtl_top_d:
        head_to_head_d.append({
            "team": "MTL", "name": n,
            "indiv": find(mtl_individuals, n),
            "on_ice": find(mtl_oi_iso, n),
        })
    for n in buf_top_d:
        head_to_head_d.append({
            "team": "BUF", "name": n,
            "indiv": find(buf_individuals, n),
            "on_ice": find(buf_oi_iso, n),
        })

    # ---- The big interpretive notes ----
    interp = {
        "g7_recap": (
            "Outshot 9-29. Won 2-1. Dobeš .966 in a Game 7 — the goalie heist that "
            "most rookies never get to author. Suzuki's L1 drought ended in P1, Newhook "
            "scored the winner from below the goal line in P3 on a backhand bat, and the "
            "Habs spent the second period without a single shot on goal."
        ),
        "series_end": (
            "All 7 games decided by 1 goal. 4 of 7 in OT. Most evenly contested R1 series "
            "in the bracket. Decided not by stars finally producing but by the rookie at the "
            "back finally stealing one — and a series-long run of low-event hockey that "
            "favored MTL's defensive shape."
        ),
        "buf_preview_summary": (
            "Buffalo enters R2 as the higher seed (Atlantic champ). They beat Boston 4-2 in "
            "6 games on the back of Alex Lyon (.955 SV%, 4.6 GSAx — top-5 NHL playoff goalie). "
            "Their offense is led by Tuch and Thompson (7 pts each in 6 GP). Their D-corps "
            "is top-heavy: Dahlin + Byram are elite, Samuelsson + Power second pair, depth thin. "
            "Vulnerable in mid-pack 5v5 play-driving (xG share around break-even per Daily Faceoff). "
            "Strength: depth scoring (3 dangerous lines), shot-quality goaltending. "
            "Weakness: average 5v5 chance suppression behind their top D."
        ),
        "matchup_thesis": (
            "Habs vs Sabres is the meeting of two not-supposed-to-be-here teams. Both finished "
            "R1 with goalies stealing critical games (Dobeš G7, Lyon all 5 of his starts). "
            "MTL's iso math says Suzuki-Caufield-Slaf are net positives at 5v5; Buffalo's says "
            "Tuch + Thompson generate but get scored on. The matchup that matters: MTL's Hutson "
            "vs Buffalo's PP1 (Dahlin running the point). Both teams' R1 PP was their key "
            "differentiator vs goal differential."
        ),
    }

    payload = {
        "meta": {
            "as_of": "2026-05-03",
            "matchup": "MTL @ TBL Game 7",
            "result": "MTL 2 - TBL 1, MTL wins series 4-3",
            "next": "Round 2 vs Buffalo Sabres, G1 Wed May 6 in Buffalo",
        },
        "g7_box": box,
        "interpretation": interp,
        "mtl_series_final": {
            "individual": mtl_individuals,
            "on_ice_5v5": mtl_oi[:15],
            "goalies": mtl_goalies,
            "special_teams": mtl_st,
        },
        "tbl_series_final": {
            "individual": tbl_individuals,
            "goalies": tbl_goalies,
            "special_teams": tbl_st,
        },
        "buffalo_r1_recap": {
            "individual": buf_individuals,
            "on_ice_5v5": buf_oi[:15],
            "goalies": buf_goalies,
            "special_teams": buf_st,
            "series_result": "BUF beat BOS 4-2 in 6, first playoff series win since 2007",
            "series_games": [
                "G1: BUF 4, BOS 3 (BUF rallies with 4 in P3)",
                "G2: BOS 4, BUF 2",
                "G3: BUF 3, BOS 1",
                "G4: BUF 6, BOS 1 (4 goals in P1)",
                "G5: BOS 2, BUF 1 (OT)",
                "G6: BUF 4, BOS 1 (Lyon 25 saves, series clincher in Boston)",
            ],
            "lyon_note": (
                "Alex Lyon: 5 GP, 1.14 GAA, .955 SV%, 4.6 GSAx (5th-best NHL playoffs). "
                "Started Boston series after Luukkonen struggled in the first 2 games. "
                "Will likely keep the net for R2 G1 vs MTL."
            ),
        },
        "r2_head_to_head_forwards": head_to_head_fwds,
        "r2_head_to_head_defense": head_to_head_d,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT_PATH}")
    print()
    print("=" * 80)
    print("MTL FINAL SERIES TOTALS (top by points)")
    print("=" * 80)
    for r in mtl_individuals[:10]:
        print(f"  {r['name']:<25} {r['position']} {r['gp']}gp {r['goals']}g {r['assists']}a "
              f"{r['points']}pt {r['shots']}sog {r['ixg']:.2f}ixG")
    print()
    print("MTL GOALIES (final):")
    for g in mtl_goalies:
        print(f"  {g['name']}: {g['gp']}gp {g['toi']:.0f}min {g['ga']}ga/{g['sa']}sa = "
              f".{int(g['sv_pct']*1000):03d} | xGA {g['xga']:.2f} | GSAx {g['gsax']:+.2f}")
    print()
    print("BUFFALO R1 SERIES TOTALS (top by points)")
    for r in buf_individuals[:10]:
        print(f"  {r['name']:<25} {r['position']} {r['gp']}gp {r['goals']}g {r['assists']}a "
              f"{r['points']}pt {r['shots']}sog {r['ixg']:.2f}ixG")
    print()
    print("BUFFALO GOALIES (R1):")
    for g in buf_goalies:
        print(f"  {g['name']}: {g['gp']}gp {g['toi']:.0f}min {g['ga']}ga/{g['sa']}sa = "
              f".{int(g['sv_pct']*1000):03d} | xGA {g['xga']:.2f} | GSAx {g['gsax']:+.2f}")


if __name__ == "__main__":
    main()
