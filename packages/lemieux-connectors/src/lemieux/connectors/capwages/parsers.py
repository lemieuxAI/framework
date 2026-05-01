"""HTML parsers for CapWages pages.

CapWages serves Next.js pages with a `__NEXT_DATA__` JSON blob that contains
the structured data — much cleaner than table-scraping. We parse the JSON
and project it into our canonical dataclass / DataFrame shape.

If CapWages migrates away from Next.js, this parser will raise a clear
error pointing at the missing __NEXT_DATA__ script tag.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from bs4 import BeautifulSoup

from .client import PlayerContract


def _next_data(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    tag = soup.find("script", id="__NEXT_DATA__")
    if not tag or not tag.string:
        raise ValueError(
            "CapWages page missing __NEXT_DATA__ JSON blob. "
            "The site may have changed framework — update the parser."
        )
    return json.loads(tag.string)


def _money(text: str | None) -> float | None:
    if text is None:
        return None
    s = re.sub(r"[\s,$]", "", str(text).strip())
    if not s or s.upper() in ("N/A", "—", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _years_from_length(text: str | None) -> int | None:
    """Parse '8 years' → 8."""
    if not text:
        return None
    m = re.search(r"(\d+)\s*year", str(text), re.IGNORECASE)
    return int(m.group(1)) if m else None


def _current_season() -> str:
    """Return the current NHL season label like '2025-26'.

    Heuristic: NHL season starts October. Before October, current season's
    YYYY-YY label uses the previous calendar year as the start.
    """
    now = datetime.now()
    if now.month >= 9:  # September onwards = next season is current
        start = now.year
    else:
        start = now.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _pick_current_year_detail(details: list[dict]) -> dict | None:
    """From a contract's year-by-year details, return the row matching this season."""
    if not details:
        return None
    season_label = _current_season()
    for row in details:
        if row.get("season") == season_label:
            return row
    return details[0]  # fallback: first row


def parse_player_contract(html: str, *, player_name: str, slug: str,
                          source_url: str) -> PlayerContract | None:
    """Parse one player's current-contract block from a CapWages player page."""
    data = _next_data(html)
    player = data.get("props", {}).get("pageProps", {}).get("player")
    if not player:
        return None
    return _player_to_contract(player, fallback_name=player_name, fallback_slug=slug,
                               source_url=source_url)


def _player_to_contract(player: dict, *, fallback_name: str, fallback_slug: str,
                        source_url: str) -> PlayerContract | None:
    contracts = player.get("contracts") or []
    if not contracts:
        return None
    # First contract in the list is the most recent / current one
    current = contracts[0]
    detail_now = _pick_current_year_detail(current.get("details", []))

    # Player name: CapWages stores "Last, First" — flip to "First Last"
    raw_name = player.get("name") or fallback_name
    if "," in raw_name:
        last, first = [p.strip() for p in raw_name.split(",", 1)]
        display_name = f"{first} {last}"
    else:
        display_name = raw_name

    # Age: from `born` or birthDate
    age = None
    born = player.get("born")
    if born:
        # CapWages format: "Aug. 10, 1999"
        try:
            d = datetime.strptime(born.replace(".", ""), "%b %d, %Y")
            age = (datetime.now() - d).days // 365
        except ValueError:
            pass

    # Length: prefer the explicit "length" field; fall back to counting seasons
    # in the details array (team-roster JSON omits length but always has details).
    length_years = _years_from_length(current.get("length"))
    if length_years is None and current.get("details"):
        length_years = len(current["details"])

    return PlayerContract(
        player_name=display_name,
        player_slug=player.get("slug") or fallback_slug,
        team=player.get("currentTeamTricode"),
        position=player.get("officialPosition") or player.get("pos"),
        age=age,
        contract_signed_date=current.get("signingDate"),
        contract_length_years=length_years,
        aav=_money(detail_now.get("aav") if detail_now else None),
        cap_hit=_money(detail_now.get("capHit") if detail_now else None),
        total_value=_money(current.get("value")),
        expiry_status=current.get("expiryStatus"),
        clause=detail_now.get("clause") if detail_now else (current.get("clauseDetails") and "yes"),
        source_url=source_url,
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


def parse_team_roster(html: str, *, team: str, source_url: str) -> pd.DataFrame:
    """Parse a team's full active roster (forwards + defense + goalies)."""
    data = _next_data(html)
    pp = data.get("props", {}).get("pageProps", {})
    roster = pp.get("data", {}).get("roster", {}) or {}

    rows: list[dict] = []
    for group in ("forwards", "defense", "goalies"):
        for p in roster.get(group, []) or []:
            contract = _player_to_contract(
                p, fallback_name=p.get("name") or "",
                fallback_slug=p.get("slug") or "",
                source_url=source_url,
            )
            if contract is None:
                continue
            row = contract.__dict__.copy()
            row["roster_group"] = group
            row["status"] = p.get("status")
            row["acquired"] = p.get("acquired")
            rows.append(row)

    df = pd.DataFrame(rows)

    # Also surface team summary stats on each row for joins downstream.
    # CapWages serves these as native ints (or {'total': ...} dicts), not
    # dollar strings — so coerce defensively.
    def _coerce(v):
        if v is None: return None
        if isinstance(v, (int, float)): return float(v)
        if isinstance(v, dict): return float(v.get("total")) if v.get("total") is not None else None
        return _money(str(v))

    summary = pp.get("teamSummary") or {}
    if not df.empty and summary:
        df["team_cap_hit_total"] = _coerce(summary.get("capHit"))
        df["team_cap_space"] = _coerce(summary.get("capSpace"))
        df["team_upper_limit"] = _coerce(summary.get("upperLimit"))
        df["team_playoff_cap"] = _coerce(summary.get("playoffCap"))

    return df
