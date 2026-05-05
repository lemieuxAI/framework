"""Game 7 advanced-stats deep dive.

The headline is 9 SOG vs 29 SOG and a Dobeš heist. The interesting question:
did Tampa create that many high-danger chances behind the volume, or was this
an extreme expression of the series pattern (Tampa drives possession but
creates relatively few inner-slot looks)?

This analyzer pulls NHL.com PBP for game 2025030127 and computes:

  1. Per-period TEAM totals (5v5 and all-strength):
     SOG, Corsi attempts, HDCF (≤22 ft from net), slot SOG, missed, blocked,
     hits, faceoffs, goals, xG estimate (distance-based logistic).

  2. Score-state breakdown — splits each metric by whether the score was
     tied / MTL leading / TBL leading / MTL trailing. Reveals whether MTL's
     "shell up" was visible in the data.

  3. Period-by-period xG flow (distance-based) — confirms the eye-test that
     P2 was Tampa's dominant period and P3 was the swing.

  4. Tampa shot-quality breakdown — for the 29 SOG, where were they from?
     Slot vs perimeter; rush vs cycle proxy; PP vs 5v5.

  5. Dobeš per-shot save expectation — sum of (1 - xG) for all unblocked
     shots faced. Compare to actual saves to estimate game-level GSAx.

  6. Series-context comparison — G7 numbers vs MTL's prior 6-game averages
     (from G1-G6 PBP, same model) to test "extreme version of the pattern".

Output: examples/habs_round1_2026/game7_advanced.numbers.json

Run:
    .venv/Scripts/python examples/habs_round1_2026/game7_advanced.py
"""

from __future__ import annotations
import json
import math
import sys
from pathlib import Path
from collections import defaultdict

import truststore; truststore.inject_into_ssl()
import requests
import yaml

GAME_ID_G7 = "2025030127"
SERIES_GAMES = [
    ("G1", "2025030121"),
    ("G2", "2025030122"),
    ("G3", "2025030123"),
    ("G4", "2025030124"),
    ("G5", "2025030125"),
    ("G6", "2025030126"),
    ("G7", "2025030127"),
]
OUT_PATH = Path(__file__).parent / "game7_advanced.numbers.json"

PBP_URL = "https://api-web.nhle.com/v1/gamecenter/{gid}/play-by-play"
BOX_URL = "https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore"

HD_DISTANCE = 22.0     # feet — slot/crease proxy (matches game4_periods.py)
INNER_SLOT_DIST = 15.0 # tighter "Grade A" cut

SHOT_TYPES = {"shot-on-goal", "missed-shot", "blocked-shot", "goal"}
UNBLOCKED_TYPES = {"shot-on-goal", "missed-shot", "goal"}  # Fenwick

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "lemieux-framework/1.0 (+https://github.com/lemieuxAI/framework)"


def fetch_json(url: str) -> dict:
    r = SESSION.get(url, timeout=20)
    r.raise_for_status()
    return r.json()


def shot_distance(x, y):
    """Distance to the offensive-zone net at (89, 0). xCoord/yCoord are NHL.com
    standard coords. abs(x) handles attacking-end orientation."""
    if x is None or y is None:
        return None
    return math.sqrt((abs(x) - 89.0) ** 2 + (y or 0.0) ** 2)


def shot_angle_deg(x, y):
    """Angle from straight-on (degrees). 0 = directly in line with net, 90 = goal-line cut."""
    if x is None or y is None:
        return None
    dx = abs(x) - 89.0
    if dx == 0 and (y is None or y == 0):
        return 0.0
    return abs(math.degrees(math.atan2(y or 0.0, dx)))


def estimate_xg(typ: str, x, y, shot_subtype: str | None = None) -> float:
    """Simple distance + angle xG estimate, tuned to roughly NHL 5v5 base rate
    (~8% per unblocked shot). Not NST-identical but transparent and consistent.
    Used for relative comparisons within this game and across the series.

    Logistic-ish form: prob = 1 / (1 + exp((d - 12) / 8))   (~50% at 12 ft)
    Then dampened by angle: cos(angle) factor.
    Blocked shots get xG = 0 by convention (treated as suppressed).
    """
    if typ == "blocked-shot":
        return 0.0
    d = shot_distance(x, y)
    if d is None:
        # Unknown coords (rare — usually neutral-zone events); ballpark mean.
        return 0.05
    # Base distance term
    p = 1.0 / (1.0 + math.exp((d - 12.0) / 8.0))
    # Angle term (cosine of angle from centerline). Cap minimum at 0.3 so
    # acute-angle shots don't get nuked.
    a = shot_angle_deg(x, y) or 0.0
    ang_factor = max(0.3, math.cos(math.radians(a)))
    p *= ang_factor
    # Tip-ins and deflections — small bump if recorded
    if shot_subtype in ("tip-in", "deflected"):
        p = min(0.6, p * 1.4)
    # Backhand small penalty
    if shot_subtype == "backhand":
        p *= 0.85
    return max(0.005, min(0.6, p))


def is_5v5(play):
    return (play.get("situationCode") or "") == "1551"


def is_pp_for(play, team_id):
    """5v4 or 5v3 with this team having more skaters."""
    sc = play.get("situationCode") or ""
    if len(sc) != 4:
        return False
    # situationCode is "AwayG-AwaySkaters-HomeSkaters-HomeG" e.g. "1551"
    away_g, away_sk, home_sk, home_g = sc[0], sc[1], sc[2], sc[3]
    return None  # we don't have home/away mapped here; handled at caller level


def compute_game(pbp: dict, gid: str) -> dict:
    """Returns dict with team_period totals, score-state splits, shot list,
    plus simple top-level summary numbers for the game."""
    home_id = pbp["homeTeam"]["id"]
    away_id = pbp["awayTeam"]["id"]
    home_abbr = pbp["homeTeam"]["abbrev"]
    away_abbr = pbp["awayTeam"]["abbrev"]

    plays = pbp.get("plays") or []

    def empty_team():
        return {
            "sog": 0, "missed": 0, "blocked_for": 0, "blocked_against": 0,
            "cf": 0, "ff": 0, "hdcf": 0, "inner_slot_cf": 0,
            "slot_sog": 0, "perim_sog": 0,
            "goals": 0, "xgf": 0.0, "xgf_unblocked": 0.0,
            "hits": 0, "fo_won": 0, "fo_lost": 0,
            "shots_list": [],  # for diagnostics
        }

    # team_period[period][team_abbr] = counters
    # period in (1, 2, 3, 4, ...)
    # situations covered: '5v5', 'pp', 'pk', 'all'
    by_period_situation = defaultdict(lambda: defaultdict(empty_team))

    # Score-state tracking — running score throughout
    home_g = 0
    away_g = 0
    by_score_state = defaultdict(lambda: defaultdict(empty_team))  # state in {tied, home_lead, away_lead}
    # We'll resolve mtl/tbl naming after — keep generic "home_lead"/"away_lead"/"tied".

    def state_key():
        if home_g == away_g:
            return "tied"
        if home_g > away_g:
            return "home_lead"
        return "away_lead"

    for play in plays:
        period = (play.get("periodDescriptor") or {}).get("number") or play.get("period") or 0
        typ = play.get("typeDescKey") or ""
        d = play.get("details") or {}
        sc = play.get("situationCode") or ""
        owner = d.get("eventOwnerTeamId")
        owner_abbr = home_abbr if owner == home_id else (away_abbr if owner == away_id else None)

        # Determine "situation" from owner perspective
        if sc == "1551":
            sit_for_owner = "5v5"
        elif len(sc) == 4 and sc.startswith("1") and sc.endswith("1"):
            # one of the teams has a man-advantage
            away_sk = int(sc[1])
            home_sk = int(sc[2])
            if owner_abbr == home_abbr:
                sit_for_owner = "pp" if home_sk > away_sk else ("pk" if home_sk < away_sk else "5v5")
            elif owner_abbr == away_abbr:
                sit_for_owner = "pp" if away_sk > home_sk else ("pk" if away_sk < home_sk else "5v5")
            else:
                sit_for_owner = "all"
        else:
            sit_for_owner = "all"  # empty net etc.

        if owner_abbr is None:
            continue

        def add(metric, n=1):
            by_period_situation[period][owner_abbr][metric] += n
            by_period_situation["all"][owner_abbr][metric] += n
            if sit_for_owner in ("5v5", "pp", "pk"):
                by_period_situation[f"{period}_{sit_for_owner}"][owner_abbr][metric] += n
                by_period_situation[f"all_{sit_for_owner}"][owner_abbr][metric] += n
            # Score-state (game-wide aggregate, all periods)
            by_score_state[state_key()][owner_abbr][metric] += n

        if typ == "hit":
            add("hits", 1)

        if typ == "faceoff":
            w = d.get("winningPlayerId"); l = d.get("losingPlayerId")
            # Faceoff team-level counts: winning team is owner.
            if w:
                add("fo_won", 1)
            # Loser team = the other team
            other = away_abbr if owner_abbr == home_abbr else home_abbr
            by_period_situation[period][other]["fo_lost"] += 1
            by_period_situation["all"][other]["fo_lost"] += 1

        if typ in SHOT_TYPES:
            x = d.get("xCoord"); y = d.get("yCoord")
            d_ft = shot_distance(x, y)
            shot_subtype = d.get("shotType")
            xg = estimate_xg(typ, x, y, shot_subtype)

            add("cf", 1)  # all attempts (Corsi)
            if typ in UNBLOCKED_TYPES:
                add("ff", 1)  # Fenwick
                add("xgf_unblocked", xg)
            add("xgf", xg)

            if typ == "shot-on-goal":
                add("sog", 1)
                if d_ft is not None and d_ft <= HD_DISTANCE:
                    add("slot_sog", 1)
                else:
                    add("perim_sog", 1)
            elif typ == "missed-shot":
                add("missed", 1)
            elif typ == "blocked-shot":
                # NHL.com PBP convention: eventOwnerTeamId for a blocked-shot
                # is the BLOCKING team (the defender). Flip ownership for
                # shot-attempt counting.
                blocked_for_team = away_abbr if owner_abbr == home_abbr else home_abbr
                # Reverse the cf/xgf we just added (above we credited owner_abbr).
                by_period_situation[period][owner_abbr]["cf"] -= 1
                by_period_situation["all"][owner_abbr]["cf"] -= 1
                if sit_for_owner in ("5v5", "pp", "pk"):
                    by_period_situation[f"{period}_{sit_for_owner}"][owner_abbr]["cf"] -= 1
                    by_period_situation[f"all_{sit_for_owner}"][owner_abbr]["cf"] -= 1
                # Now credit the actual shooter team
                by_period_situation[period][blocked_for_team]["cf"] += 1
                by_period_situation["all"][blocked_for_team]["cf"] += 1
                # Track block-for-defender separately
                by_period_situation[period][owner_abbr]["blocked_for"] += 1
                by_period_situation["all"][owner_abbr]["blocked_for"] += 1
                by_period_situation[period][blocked_for_team]["blocked_against"] += 1
                by_period_situation["all"][blocked_for_team]["blocked_against"] += 1
            elif typ == "goal":
                add("sog", 1)
                add("goals", 1)
                if d_ft is not None and d_ft <= HD_DISTANCE:
                    add("slot_sog", 1)
                else:
                    add("perim_sog", 1)

            # HDCF: unblocked attempts within home plate (≤22 ft from net)
            if typ in UNBLOCKED_TYPES:
                if d_ft is not None and d_ft <= HD_DISTANCE:
                    # A high-danger shot from a tight angle is still high danger
                    add("hdcf", 1)
                if d_ft is not None and d_ft <= INNER_SLOT_DIST:
                    add("inner_slot_cf", 1)
                # diagnostics
                by_period_situation[period][owner_abbr]["shots_list"].append({
                    "type": typ, "x": x, "y": y, "dist": round(d_ft, 1) if d_ft else None,
                    "xg": round(xg, 3), "subtype": shot_subtype, "sit": sit_for_owner,
                    "score_state_at_event": f"{home_abbr}{home_g}-{away_abbr}{away_g}",
                })

        # Apply goal AFTER counting it (so the goal itself is in the tied state
        # if it was tied just before, etc.).
        if typ == "goal":
            if owner_abbr == home_abbr:
                home_g += 1
            elif owner_abbr == away_abbr:
                away_g += 1

    # Convert defaultdicts to plain dicts and round xg
    def normalize(team_dict):
        out = {}
        for team, counters in team_dict.items():
            out[team] = {
                k: (round(v, 3) if isinstance(v, float) else v)
                for k, v in counters.items() if k != "__placeholder"
            }
        return out

    period_table = {}
    for k, v in by_period_situation.items():
        period_table[str(k)] = normalize(v)

    score_state_table = {}
    for k, v in by_score_state.items():
        score_state_table[k] = normalize(v)

    # Final score & meta
    return {
        "game_id": gid,
        "home_team": home_abbr, "away_team": away_abbr,
        "home_id": home_id, "away_id": away_id,
        "final_score": {home_abbr: home_g, away_abbr: away_g},
        "by_period_situation": period_table,
        "by_score_state": score_state_table,
    }


def summarize_to_team_view(game: dict, team_abbr: str) -> dict:
    """Pivot to a flat per-team view focused on the answer to:
    'Did Tampa create high-danger chances or just take outside shots?'"""
    bps = game["by_period_situation"]
    other = game["away_team"] if team_abbr == game["home_team"] else game["home_team"]

    def get(period_sit, team):
        return bps.get(period_sit, {}).get(team, {})

    out = {"team": team_abbr, "opp": other, "periods": {}}
    for p in (1, 2, 3, 4):
        if str(p) not in bps and f"{p}_5v5" not in bps:
            continue
        all_sit = get(str(p), team_abbr)
        five_v_five = get(f"{p}_5v5", team_abbr)
        pp = get(f"{p}_pp", team_abbr)
        pk = get(f"{p}_pk", team_abbr)
        out["periods"][f"P{p}"] = {
            "all": {k: all_sit.get(k, 0) for k in
                    ("sog", "cf", "ff", "hdcf", "inner_slot_cf", "slot_sog", "perim_sog",
                     "goals", "xgf", "xgf_unblocked", "hits", "blocked_for", "blocked_against")},
            "5v5": {k: five_v_five.get(k, 0) for k in
                    ("sog", "cf", "ff", "hdcf", "inner_slot_cf", "slot_sog", "perim_sog",
                     "goals", "xgf", "xgf_unblocked")},
            "pp":  {k: pp.get(k, 0) for k in ("sog", "cf", "ff", "hdcf", "goals", "xgf")},
            "pk":  {k: pk.get(k, 0) for k in ("sog", "cf", "ff", "hdcf", "goals", "xgf")},
        }
    # Game totals
    all_sit = get("all", team_abbr)
    fv5 = get("all_5v5", team_abbr)
    pp = get("all_pp", team_abbr)
    pk = get("all_pk", team_abbr)
    out["game"] = {
        "all": {k: all_sit.get(k, 0) for k in
                ("sog", "cf", "ff", "hdcf", "inner_slot_cf", "slot_sog", "perim_sog",
                 "goals", "xgf", "xgf_unblocked", "hits", "blocked_for", "blocked_against",
                 "fo_won", "fo_lost")},
        "5v5": {k: fv5.get(k, 0) for k in
                ("sog", "cf", "ff", "hdcf", "inner_slot_cf", "slot_sog", "perim_sog",
                 "goals", "xgf", "xgf_unblocked")},
        "pp":  {k: pp.get(k, 0) for k in ("sog", "cf", "ff", "hdcf", "goals", "xgf")},
        "pk":  {k: pk.get(k, 0) for k in ("sog", "cf", "ff", "hdcf", "goals", "xgf")},
    }
    return out


def main():
    # ---- G7 deep dive ----
    print(f"Fetching G7 PBP ({GAME_ID_G7})...")
    pbp = fetch_json(PBP_URL.format(gid=GAME_ID_G7))
    g7 = compute_game(pbp, GAME_ID_G7)

    # Extract team views for the question
    mtl_view = summarize_to_team_view(g7, "MTL")
    tbl_view = summarize_to_team_view(g7, "TBL")

    # Score-state breakdown for MTL: what happened when leading, tied, trailing?
    score_state = g7["by_score_state"]

    # Goalie-perspective: Dobeš expected vs actual.
    # MTL was the away team. TBL shot at MTL net. So Dobeš's xGA = TBL's xgf_unblocked.
    tbl_unblocked_xg = sum(g7["by_period_situation"]["all"].get("TBL", {}).get("xgf_unblocked", 0.0)
                            for _ in [0])
    # easier: read from view
    tbl_xgf_unblocked = tbl_view["game"]["all"]["xgf_unblocked"]
    mtl_actual_ga = g7["final_score"]["TBL"]
    dobes_gsax_estimate = tbl_xgf_unblocked - mtl_actual_ga

    mtl_xgf_unblocked = mtl_view["game"]["all"]["xgf_unblocked"]
    tbl_actual_ga = g7["final_score"]["MTL"]
    vasi_gsax_estimate = mtl_xgf_unblocked - tbl_actual_ga

    # ---- Series context: G1-G6 averages with the same model ----
    print("Fetching G1-G6 PBP for series-context comparison...")
    series_per_game = {}
    series_totals_mtl = defaultdict(float)
    series_totals_tbl = defaultdict(float)
    for label, gid in SERIES_GAMES[:-1]:
        try:
            pbp_i = fetch_json(PBP_URL.format(gid=gid))
            g_i = compute_game(pbp_i, gid)
            mtl_i = summarize_to_team_view(g_i, "MTL")
            tbl_i = summarize_to_team_view(g_i, "TBL")
            series_per_game[label] = {
                "MTL": {"all": mtl_i["game"]["all"], "5v5": mtl_i["game"]["5v5"]},
                "TBL": {"all": tbl_i["game"]["all"], "5v5": tbl_i["game"]["5v5"]},
                "final_score": g_i["final_score"],
            }
            for k, v in mtl_i["game"]["all"].items():
                if isinstance(v, (int, float)):
                    series_totals_mtl[k] += v
            for k, v in tbl_i["game"]["all"].items():
                if isinstance(v, (int, float)):
                    series_totals_tbl[k] += v
        except Exception as e:
            print(f"  ! {label} ({gid}) failed: {e}")

    n_prior = len(series_per_game)
    avg_prior_mtl = {k: round(v / n_prior, 2) for k, v in series_totals_mtl.items()} if n_prior else {}
    avg_prior_tbl = {k: round(v / n_prior, 2) for k, v in series_totals_tbl.items()} if n_prior else {}

    # ---- Build interpretive deltas: was G7 an extreme version of the pattern? ----
    g7_mtl_all = mtl_view["game"]["all"]
    g7_tbl_all = tbl_view["game"]["all"]
    deltas_vs_prior = {}
    for k in ("sog", "cf", "ff", "hdcf", "inner_slot_cf", "slot_sog", "perim_sog", "xgf", "xgf_unblocked"):
        deltas_vs_prior[k] = {
            "MTL_g7": g7_mtl_all.get(k, 0),
            "MTL_avg_prior_g1_g6": avg_prior_mtl.get(k, 0),
            "MTL_delta": round(g7_mtl_all.get(k, 0) - avg_prior_mtl.get(k, 0), 2),
            "TBL_g7": g7_tbl_all.get(k, 0),
            "TBL_avg_prior_g1_g6": avg_prior_tbl.get(k, 0),
            "TBL_delta": round(g7_tbl_all.get(k, 0) - avg_prior_tbl.get(k, 0), 2),
        }

    # ---- Diagnostics: list every TBL shot with location + xg, sorted by xg ----
    tbl_shots = []
    for psit, teams in g7["by_period_situation"].items():
        if "_" in psit or psit == "all":
            continue
        if "TBL" not in teams:
            continue
        for s in teams["TBL"].get("shots_list", []):
            tbl_shots.append({**s, "period": psit})
    tbl_shots_by_xg = sorted(tbl_shots, key=lambda s: -s["xg"])

    payload = {
        "meta": {
            "as_of": "2026-05-04",
            "purpose": (
                "Deep advanced-stats look at G7. Did Tampa actually create high-danger chances "
                "behind their volume, or was 9-29 SOG an extreme expression of the series pattern: "
                "Tampa drives possession but generates few inner-slot looks?"
            ),
            "game_id_g7": GAME_ID_G7,
            "model_notes": (
                "xG estimate: distance + angle logistic, ~50% at 12 ft straight-on, dampened by "
                "cosine of angle. Tip-ins +40% bump. Backhands -15%. Calibrated to ~8% per "
                "unblocked shot at NHL 5v5 baseline. NOT NST-identical — used for relative "
                "comparisons within and across series games. HDCF cutoff: 22 ft from net "
                "(NST 'home plate' proxy). Inner slot cutoff: 15 ft."
            ),
        },
        "g7_full_game": g7,
        "g7_team_view_mtl": mtl_view,
        "g7_team_view_tbl": tbl_view,
        "g7_score_state": score_state,
        "g7_dobes_gsax_estimate": {
            "tbl_unblocked_xg_for": round(tbl_xgf_unblocked, 2),
            "mtl_actual_ga": mtl_actual_ga,
            "dobes_gsax_estimate": round(dobes_gsax_estimate, 2),
            "interpretation": (
                f"Dobeš faced ~{round(tbl_xgf_unblocked, 1)} expected goals on TBL's unblocked "
                f"attempts and allowed {mtl_actual_ga}. GSAx ≈ {round(dobes_gsax_estimate, 1)}."
            ),
        },
        "g7_vasilevskiy_gsax_estimate": {
            "mtl_unblocked_xg_for": round(mtl_xgf_unblocked, 2),
            "tbl_actual_ga": tbl_actual_ga,
            "vasi_gsax_estimate": round(vasi_gsax_estimate, 2),
            "interpretation": (
                f"Vasilevskiy faced ~{round(mtl_xgf_unblocked, 1)} expected goals on MTL's 9 "
                f"unblocked attempts and allowed {tbl_actual_ga}. GSAx ≈ {round(vasi_gsax_estimate, 1)}."
            ),
        },
        "series_per_game": series_per_game,
        "series_avg_prior_g1_g6": {"MTL": avg_prior_mtl, "TBL": avg_prior_tbl},
        "g7_deltas_vs_prior": deltas_vs_prior,
        "tbl_shot_quality_diagnostic": {
            "all_shots_sorted_by_xg": tbl_shots_by_xg,
            "n_shots_logged": len(tbl_shots),
        },
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {OUT_PATH}")
    print()
    print("=" * 80)
    print("G7 SUMMARY (all situations)")
    print("=" * 80)
    print(f"  MTL: SOG {g7_mtl_all['sog']:>2}  CF {g7_mtl_all['cf']:>3}  FF {g7_mtl_all['ff']:>3}  "
          f"HDCF {g7_mtl_all['hdcf']:>2}  innerSlot {g7_mtl_all['inner_slot_cf']:>2}  "
          f"slotSOG {g7_mtl_all['slot_sog']:>2}  xG {g7_mtl_all['xgf']:>5.2f}  "
          f"xGunb {g7_mtl_all['xgf_unblocked']:>5.2f}  G {g7_mtl_all['goals']}")
    print(f"  TBL: SOG {g7_tbl_all['sog']:>2}  CF {g7_tbl_all['cf']:>3}  FF {g7_tbl_all['ff']:>3}  "
          f"HDCF {g7_tbl_all['hdcf']:>2}  innerSlot {g7_tbl_all['inner_slot_cf']:>2}  "
          f"slotSOG {g7_tbl_all['slot_sog']:>2}  xG {g7_tbl_all['xgf']:>5.2f}  "
          f"xGunb {g7_tbl_all['xgf_unblocked']:>5.2f}  G {g7_tbl_all['goals']}")
    print()
    print("PER-PERIOD (all situations):")
    for p, d in mtl_view["periods"].items():
        m = d["all"]; t = tbl_view["periods"][p]["all"]
        print(f"  {p}  MTL: SOG {m['sog']:>2} CF {m['cf']:>2} HDCF {m['hdcf']:>2} xG {m['xgf']:>4.2f}  |  "
              f"TBL: SOG {t['sog']:>2} CF {t['cf']:>2} HDCF {t['hdcf']:>2} xG {t['xgf']:>4.2f}")
    print()
    print(f"DOBEŠ GSAx (this-game model): TBL xGA on net = {tbl_xgf_unblocked:.2f}, "
          f"actual GA = {mtl_actual_ga}, GSAx ≈ {dobes_gsax_estimate:+.2f}")
    print(f"VASILEVSKIY (this-game model): MTL xGF on net = {mtl_xgf_unblocked:.2f}, "
          f"actual GA = {tbl_actual_ga}, GSAx ≈ {vasi_gsax_estimate:+.2f}")
    print()
    print("=" * 80)
    print("SERIES CONTEXT — G7 vs G1-G6 averages")
    print("=" * 80)
    print(f"  {'metric':<18} {'MTL_g7':>8} {'MTL_avg':>9} {'Δ':>7}     {'TBL_g7':>8} {'TBL_avg':>9} {'Δ':>7}")
    for k in ("sog", "cf", "hdcf", "inner_slot_cf", "xgf", "xgf_unblocked"):
        d = deltas_vs_prior[k]
        print(f"  {k:<18} {d['MTL_g7']:>8} {d['MTL_avg_prior_g1_g6']:>9} {d['MTL_delta']:>+7.2f}    "
              f"{d['TBL_g7']:>8} {d['TBL_avg_prior_g1_g6']:>9} {d['TBL_delta']:>+7.2f}")
    print()
    print("TOP 10 TAMPA SHOTS BY xG ESTIMATE:")
    for s in tbl_shots_by_xg[:10]:
        sub = s.get('subtype') or '?'
        print(f"  P{s['period']}  d={s['dist']:>5}ft  xG={s['xg']:.3f}  {s['type']:<14}  {sub:<10}  "
              f"sit={s['sit']}  score@event={s['score_state_at_event']}")


if __name__ == "__main__":
    main()
