"""Game 6 special — TBL 1, MTL 0 (OT). Series tied 3-3, Game 7 looming.

Combines:
  1. Game 6 box-score-derived stats
  2. Series G1-G6 cumulative MTL-vs-TBL story
  3. League-wide playoff rankings (16 teams) by:
     - 5v5 iso net60 (skaters, ≥30 min toi)
     - Total points (all situations)
     - GSAx per 60 (goalies, ≥120 min)
     - SV% (goalies, raw rate)
  4. Series-team-overview xG vs goals (overperformance check)

Output: game6_special.numbers.json
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import numpy as np
import yaml

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
OUT = HERE / "game6_special.numbers.json"
DB = REPO / "legacy" / "data" / "store.sqlite"

PLAYOFF_TEAMS = [
    "MTL", "T.B", "BOS", "BUF", "OTT", "CAR", "PIT", "PHI",
    "DAL", "MIN", "EDM", "ANA", "COL", "L.A", "VGK", "UTA",
]


def fetch(con, q, params=()):
    return con.execute(q, params).fetchall()


# ---------- 1. Game 6 box-score processing ----------

def toi_seconds(toi_str: str) -> int:
    if not toi_str: return 0
    m, s = toi_str.split(":"); return int(m) * 60 + int(s)


def process_game6_box(box: dict) -> dict:
    """Per-team leaderboards for G6 only."""
    out = {}
    for team in ("MTL", "TBL"):
        skaters = box["skaters"][team]
        ranked = []
        for sk in skaters:
            ranked.append({
                "name": sk["name"], "pos": sk["pos"],
                "g": sk["g"], "a": sk["a"], "pts": sk["g"] + sk["a"],
                "sog": sk["sog"],
                "toi_min": round(toi_seconds(sk["toi"]) / 60.0, 1),
                "hits": sk["hits"], "plus_minus": sk["plus_minus"], "pim": sk["pim"],
            })
        ranked.sort(key=lambda r: (-r["pts"], -r["sog"], -r["toi_min"]))
        out[team] = ranked
    return out


# ---------- 2. Series G1-G6 cumulative for MTL + TBL ----------

def series_cumulative(con) -> dict:
    """MTL + TBL cumulative individual stats through G6 (post-NST refresh)."""
    out = {"MTL": [], "TBL": []}
    for team_db in ("MTL", "T.B"):
        team_label = "MTL" if team_db == "MTL" else "TBL"
        rows = con.execute("""
            SELECT name, gp, goals, assists, points, shots, ixg, ihdcf
            FROM skater_individual_stats
            WHERE team_id=? AND season='20252026' AND stype=3 AND sit='all'
            ORDER BY points DESC, goals DESC, shots DESC
        """, (team_db,)).fetchall()
        for r in rows:
            out[team_label].append({
                "name": r[0], "gp": r[1], "g": r[2], "a": r[3], "p": r[4],
                "sog": r[5], "ixg": round(r[6] or 0, 2), "ihdcf": r[7],
            })
    return out


# ---------- 3. League-wide playoff rankings ----------

def league_skater_rankings(con) -> dict:
    """Top players league-wide on 5v5 iso net60, all-sit points."""
    teams_filter = ",".join(["?"] * len(PLAYOFF_TEAMS))

    # 5v5 iso net60 (≥30 toi)
    iso_rows = con.execute(f"""
        SELECT name, team_id, gp, toi, xgf, xga
        FROM skater_stats
        WHERE season='20252026' AND stype=3 AND sit='5v5' AND split='oi'
          AND team_id IN ({teams_filter})
          AND toi >= 30
        ORDER BY (xgf - xga) * 60.0 / toi DESC
        LIMIT 25
    """, PLAYOFF_TEAMS).fetchall()
    by_iso = []
    for r in iso_rows:
        name, team, gp, toi, xgf, xga = r
        by_iso.append({
            "name": name, "team": team, "gp": gp, "toi": round(toi, 1),
            "iso_xgf60": round(xgf * 60.0 / toi, 3),
            "iso_xga60": round(xga * 60.0 / toi, 3),
            "iso_net60": round((xgf - xga) * 60.0 / toi, 3),
        })

    # Points (all-sit) — top 25
    pts_rows = con.execute(f"""
        SELECT name, team_id, gp, points, goals, assists, shots, ixg
        FROM skater_individual_stats
        WHERE season='20252026' AND stype=3 AND sit='all'
          AND team_id IN ({teams_filter})
        ORDER BY points DESC, goals DESC, shots DESC
        LIMIT 25
    """, PLAYOFF_TEAMS).fetchall()
    by_pts = []
    for r in pts_rows:
        by_pts.append({
            "name": r[0], "team": r[1], "gp": r[2],
            "pts": r[3], "g": r[4], "a": r[5], "sog": r[6],
            "ixg": round(r[7] or 0, 2),
            "ppg": round(r[3] / r[2], 2) if r[2] else 0,
        })

    return {"top_by_iso_net60": by_iso, "top_by_points": by_pts}


def league_goalie_rankings(con) -> dict:
    """Top goalies league-wide by GSAx/60 + raw SV%, ≥120 min."""
    teams_filter = ",".join(["?"] * len(PLAYOFF_TEAMS))

    rows = con.execute(f"""
        SELECT name, team_id, gp, toi, sa, ga, xga, sv_pct, gsax
        FROM goalie_stats
        WHERE season='20252026' AND stype=3 AND sit='all'
          AND team_id IN ({teams_filter})
          AND toi >= 120
    """, PLAYOFF_TEAMS).fetchall()
    out = []
    for r in rows:
        name, team, gp, toi, sa, ga, xga, sv_pct, gsax = r
        gsax = float(gsax) if gsax is not None else (float(xga or 0) - float(ga or 0))
        gsax_per60 = gsax * 60.0 / toi if toi else 0
        out.append({
            "name": name, "team": team, "gp": gp, "toi": round(toi, 1),
            "sa": sa, "ga": ga,
            "sv_pct": round(sv_pct or 0, 4),
            "gsax": round(gsax, 2),
            "gsax_per60": round(gsax_per60, 3),
        })

    by_gsax = sorted(out, key=lambda x: -x["gsax_per60"])[:12]
    by_sv = sorted(out, key=lambda x: -x["sv_pct"])[:12]
    return {"top_by_gsax_per60": by_gsax, "top_by_sv_pct": by_sv}


# ---------- 4. Series team xG vs goals (overperformance check) ----------

def series_team_overview(con) -> dict:
    out_all = {}
    out_5v5 = {}
    for team_db in ("MTL", "T.B"):
        # All sit
        r = con.execute("""
            SELECT toi, gp, gf, ga, xgf, xga, sf, sa, scf, sca, hdcf, hdca
            FROM team_stats
            WHERE team_id=? AND season='20252026' AND stype=3 AND sit='all'
        """, (team_db,)).fetchone()
        if r:
            toi, gp, gf, ga, xgf, xga, sf, sa, scf, sca, hdcf, hdca = r
            out_all[team_db] = {
                "gp": gp, "toi": round(toi, 1),
                "gf": gf, "ga": ga,
                "xgf": round(xgf, 2), "xga": round(xga, 2),
                "sf": sf, "sa": sa, "scf": scf, "sca": sca, "hdcf": hdcf, "hdca": hdca,
                "gf_minus_xgf": round(gf - xgf, 2),
                "ga_minus_xga": round(ga - xga, 2),
            }
        # 5v5
        r5 = con.execute("""
            SELECT toi, gf, ga, xgf, xga, hdcf, hdca
            FROM team_stats
            WHERE team_id=? AND season='20252026' AND stype=3 AND sit='5v5'
        """, (team_db,)).fetchone()
        if r5:
            toi, gf, ga, xgf, xga, hdcf, hdca = r5
            out_5v5[team_db] = {
                "toi": round(toi, 1), "gf": gf, "ga": ga,
                "xgf": round(xgf, 2), "xga": round(xga, 2),
                "hdcf": hdcf, "hdca": hdca,
                "xgf_pct": round(xgf / (xgf + xga) * 100, 1) if (xgf + xga) > 0 else None,
            }
    return {"all_situations": out_all, "five_v_five": out_5v5}


# ---------- 5. MTL key-player series numbers (the "are they due?" view) ----------

def mtl_key_player_series(con) -> dict:
    """Series-direct stats for the L1 + Hutson/Demidov/Gallagher narrative."""
    keys = ["Nick Suzuki", "Cole Caufield", "Juraj Slafkovský",
            "Lane Hutson", "Ivan Demidov", "Brendan Gallagher",
            "Alexandre Texier", "Kirby Dach", "Zachary Bolduc"]
    out = {}
    for name in keys:
        r_all = con.execute("""
            SELECT gp, toi, goals, assists, points, shots, ixg, ihdcf
            FROM skater_individual_stats
            WHERE name=? AND season='20252026' AND stype=3 AND sit='all'
        """, (name,)).fetchone()
        r_5v5 = con.execute("""
            SELECT gp, toi, goals, assists, points, shots, ixg, ihdcf
            FROM skater_individual_stats
            WHERE name=? AND season='20252026' AND stype=3 AND sit='5v5'
        """, (name,)).fetchone()
        oi_5v5 = con.execute("""
            SELECT toi, xgf, xga
            FROM skater_stats
            WHERE name=? AND season='20252026' AND stype=3 AND sit='5v5' AND split='oi'
        """, (name,)).fetchone()
        d = {"name": name}
        if r_all:
            d["all"] = {"gp": r_all[0], "toi": round(r_all[1], 0),
                        "g": r_all[2], "a": r_all[3], "p": r_all[4],
                        "sog": r_all[5], "ixg": round(r_all[6] or 0, 2),
                        "ihdcf": r_all[7]}
        if r_5v5:
            d["5v5"] = {"gp": r_5v5[0], "toi": round(r_5v5[1], 0),
                        "g": r_5v5[2], "a": r_5v5[3], "p": r_5v5[4],
                        "sog": r_5v5[5], "ixg": round(r_5v5[6] or 0, 2)}
        if oi_5v5:
            toi, xgf, xga = oi_5v5
            d["oi_5v5"] = {
                "toi": round(toi, 1),
                "iso_net60": round((xgf - xga) * 60.0 / toi, 3) if toi else 0,
                "iso_xgf60": round(xgf * 60.0 / toi, 3) if toi else 0,
                "iso_xga60": round(xga * 60.0 / toi, 3) if toi else 0,
            }
        out[name] = d
    return out


def main():
    con = sqlite3.connect(DB)
    BOX = yaml.safe_load((HERE / "game6_box_score.yaml").read_text(encoding="utf-8"))

    g6_leaderboards = process_game6_box(BOX)
    series_cum = series_cumulative(con)
    league_skaters = league_skater_rankings(con)
    league_goalies = league_goalie_rankings(con)
    series_overview = series_team_overview(con)
    key_players = mtl_key_player_series(con)

    payload = {
        "meta": {
            "as_of": "2026-05-02",
            "matchup": "TBL @ MTL Game 6",
            "final_score": BOX["final_score"],
            "result": BOX["result"],
            "series_state": BOX["series_state_after_game"],
            "data_source": "Box score from NHL.com + ESPN + CBS (G6); NST refreshed 2026-05-02 for league-wide context.",
        },
        "g6_box": BOX["team_stats"],
        "g6_periods": BOX["periods"],
        "g6_goal_sequence": BOX["goal_sequence"],
        "g6_goalies": BOX["goalies"],
        "g6_skaters_ranked": g6_leaderboards,
        "g6_narrative_anchors": BOX["narrative_anchors"],
        "series_cumulative_individual": series_cum,
        "series_team_overview": series_overview,
        "league_skater_rankings": league_skaters,
        "league_goalie_rankings": league_goalies,
        "mtl_key_player_series": key_players,
    }

    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"wrote {OUT}")
    print()

    # Console summary
    print("=" * 90)
    print(f"GAME 6: {BOX['final_score']} — {BOX['series_state_after_game']}")
    print("=" * 90)
    print()

    # Series team xG
    a = series_overview["all_situations"]
    if "MTL" in a and "T.B" in a:
        print(f"Series totals (all sit, G1-G6):")
        print(f"  MTL: GF={a['MTL']['gf']}/{a['MTL']['xgf']:.2f} xGF (Δ {a['MTL']['gf_minus_xgf']:+.2f})  GA={a['MTL']['ga']}/{a['MTL']['xga']:.2f} xGA")
        print(f"  TBL: GF={a['T.B']['gf']}/{a['T.B']['xgf']:.2f} xGF (Δ {a['T.B']['gf_minus_xgf']:+.2f})  GA={a['T.B']['ga']}/{a['T.B']['xga']:.2f} xGA")
    print()

    # MTL G6 leaders
    print("MTL G6 — top by SOG:")
    for r in sorted(g6_leaderboards["MTL"], key=lambda x: -x["sog"])[:5]:
        print(f"  {r['name']:25s}  TOI={r['toi_min']:>5.1f}  SOG={r['sog']}  hits={r['hits']}")
    print()
    print("TBL G6 — top by SOG:")
    for r in sorted(g6_leaderboards["TBL"], key=lambda x: -x["sog"])[:5]:
        print(f"  {r['name']:25s}  TOI={r['toi_min']:>5.1f}  SOG={r['sog']}  hits={r['hits']}")
    print()

    # League iso top-10
    print("LEAGUE — Top-10 by 5v5 iso net60 (≥30 toi):")
    for r in league_skaters["top_by_iso_net60"][:10]:
        print(f"  {r['name']:25s} {r['team']:5s}  GP={r['gp']}  toi={r['toi']:>5.0f}  iso_net={r['iso_net60']:+.3f}")
    print()
    print("LEAGUE — Top-10 by points:")
    for r in league_skaters["top_by_points"][:10]:
        print(f"  {r['name']:25s} {r['team']:5s}  GP={r['gp']}  P={r['pts']}  G={r['g']}  ixG={r['ixg']:.2f}")
    print()
    print("LEAGUE — Top goalies by GSAx/60:")
    for r in league_goalies["top_by_gsax_per60"][:8]:
        print(f"  {r['name']:25s} {r['team']:5s}  GP={r['gp']}  toi={r['toi']:>4.0f}  GSAx/60={r['gsax_per60']:+.3f}  SV%={r['sv_pct']:.4f}")
    print()
    print("MTL key-player series check:")
    for name in ("Nick Suzuki", "Cole Caufield", "Juraj Slafkovský", "Lane Hutson", "Ivan Demidov", "Brendan Gallagher"):
        d = key_players[name]
        all_p = d.get("all", {}); v5 = d.get("5v5", {}); oi = d.get("oi_5v5", {})
        iso = oi.get("iso_net60")
        iso_s = f"{iso:+.3f}" if isinstance(iso, (int, float)) else "—"
        print(f"  {name:25s}  ALL P={all_p.get('p','?')} G={all_p.get('g','?')} | 5v5 P={v5.get('p','?')} G={v5.get('g','?')} | oi_iso_net={iso_s}")


if __name__ == "__main__":
    main()
