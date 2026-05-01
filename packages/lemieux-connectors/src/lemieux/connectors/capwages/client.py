"""HTTP client + parser for CapWages.com.

Server-rendered HTML, no JS-blocked content. Two endpoints:
  - https://capwages.com/teams/<slug>           full roster + contract data
  - https://capwages.com/players/<lastname-firstname>  one player contract

We parse with BeautifulSoup — pages are stable enough that table-position
scraping holds; if/when the site refactors, the parser raises a clear error
documenting the diff.

Polite client: 1 req/sec default, 30s timeout, retry on 5xx/429, results
cached via the shared Lemieux HttpCache.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from .._base import Connector, ConnectorMetadata

CAPWAGES_BASE = "https://capwages.com"

CAPWAGES_CONNECTOR_META = ConnectorMetadata(
    id="capwages",
    name_en="CapWages",
    name_fr="CapWages",
    source_url="https://capwages.com/",
    license_note=(
        "Public-facing site; robots.txt is permissive (Allow: /). "
        "Polite rate limit + aggressive caching enforced; do not redistribute "
        "raw tables. Cite as source for any derived contract analysis."
    ),
    rate_limit_hint="1 req/sec with polite backoff. Cache aggressively.",
    key_required=False,
    safe_to_cache=True,
    tags=["nhl", "salary-cap", "contracts"],
)


# Team slug map — CapWages uses underscored names.
TEAM_SLUGS: dict[str, str] = {
    "ANA": "anaheim_ducks",
    "ARI": "arizona_coyotes",   # historic, kept for completeness
    "BOS": "boston_bruins",
    "BUF": "buffalo_sabres",
    "CGY": "calgary_flames",
    "CAR": "carolina_hurricanes",
    "CHI": "chicago_blackhawks",
    "COL": "colorado_avalanche",
    "CBJ": "columbus_blue_jackets",
    "DAL": "dallas_stars",
    "DET": "detroit_red_wings",
    "EDM": "edmonton_oilers",
    "FLA": "florida_panthers",
    "L.A": "los_angeles_kings",
    "LAK": "los_angeles_kings",
    "MIN": "minnesota_wild",
    "MTL": "montreal_canadiens",
    "NSH": "nashville_predators",
    "N.J": "new_jersey_devils",
    "NJD": "new_jersey_devils",
    "NYI": "new_york_islanders",
    "NYR": "new_york_rangers",
    "OTT": "ottawa_senators",
    "PHI": "philadelphia_flyers",
    "PIT": "pittsburgh_penguins",
    "S.J": "san_jose_sharks",
    "SJS": "san_jose_sharks",
    "SEA": "seattle_kraken",
    "STL": "st_louis_blues",
    "T.B": "tampa_bay_lightning",
    "TBL": "tampa_bay_lightning",
    "TOR": "toronto_maple_leafs",
    "UTA": "utah_mammoth",        # 25-26 rebrand
    "VAN": "vancouver_canucks",
    "VGK": "vegas_golden_knights",
    "WSH": "washington_capitals",
    "WPG": "winnipeg_jets",
}


def canonical_team_slug(team: str) -> str:
    """Return a CapWages team slug from a 3-char abbrev or full name."""
    abbrev = team.upper().strip()
    slug = TEAM_SLUGS.get(abbrev)
    if slug:
        return slug
    # Fallback: full-name → snake_case
    slug = re.sub(r"[^a-zA-Z\s]", "", team).strip().lower().replace(" ", "_")
    return slug


def canonical_player_slug(name: str) -> str:
    """Convert a player name into the CapWages URL slug.

    Pattern: lowercase, ASCII-folded, diacritics stripped, hyphenated.
    'Juraj Slafkovský' → 'juraj-slafkovsky'.
    The CapWages site uses {first}-{last} order in the slug.
    """
    if not name:
        return ""
    folded = "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    )
    folded = folded.lower().strip()
    # Replace spaces, dots, apostrophes with hyphens; collapse multiples
    folded = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    return folded


@dataclass
class PlayerContract:
    """Parsed current-contract block for one player."""
    player_name: str
    player_slug: str
    team: str | None
    position: str | None
    age: int | None
    contract_signed_date: str | None
    contract_length_years: int | None
    aav: float | None              # average annual value, dollars
    cap_hit: float | None          # current-season cap hit, dollars
    total_value: float | None      # contract total, dollars
    expiry_status: str | None      # 'UFA' / 'RFA' / etc
    clause: str | None             # 'NMC', 'M-NTC', etc
    source_url: str
    fetched_at: str | None = None


def _parse_money(text: str) -> float | None:
    if not text:
        return None
    s = re.sub(r"[\s,$]", "", text.strip())
    if not s or s.upper() == "N/A":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(text: str) -> int | None:
    if not text:
        return None
    s = re.sub(r"[^\d-]", "", text.strip())
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


class CapWagesClient(Connector):
    """Polite scraper for CapWages player + team pages."""

    meta = CAPWAGES_CONNECTOR_META

    def __init__(self, *args, **kwargs):
        # Default to a slower 1 req/sec rate; CapWages is a small operator.
        kwargs.setdefault("rate_per_sec", 1.0)
        super().__init__(*args, **kwargs)

    # 24h TTL by default for contract data — contracts don't change between scrapes
    # except on signing days. Override with `cache_ttl=` for short-lived runs.
    DEFAULT_CACHE_TTL_S = 86400.0

    @retry(
        retry=retry_if_exception_type(requests.exceptions.RequestException),
        wait=wait_exponential_jitter(initial=2, max=15),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def _fetch(self, url: str, ttl_seconds: float | None = None) -> str:
        """Fetch URL through cache + rate limiter; returns HTML text."""
        ttl = ttl_seconds if ttl_seconds is not None else self.DEFAULT_CACHE_TTL_S
        cached = self.cache.get(url, ttl_seconds=ttl)
        if cached is not None:
            return cached.decode("utf-8", errors="replace")
        self.limiter.wait()
        r = self.session.get(url, timeout=30)
        r.raise_for_status()
        body = r.text
        self.cache.put(url, body.encode("utf-8"))
        return body

    def fetch_team_html(self, team: str) -> str:
        slug = canonical_team_slug(team)
        url = f"{CAPWAGES_BASE}/teams/{slug}"
        return self._fetch(url)

    def fetch_player_html(self, name: str) -> str:
        slug = canonical_player_slug(name)
        url = f"{CAPWAGES_BASE}/players/{slug}"
        return self._fetch(url)

    def fetch_player_contract(self, name: str) -> PlayerContract | None:
        """Fetch + parse one player's current-contract block."""
        from .parsers import parse_player_contract
        slug = canonical_player_slug(name)
        url = f"{CAPWAGES_BASE}/players/{slug}"
        html = self._fetch(url)
        return parse_player_contract(html, player_name=name, slug=slug, source_url=url)

    def fetch_team_roster(self, team: str):
        """Fetch + parse one team's full active roster contract table.

        Returns a pandas DataFrame with one row per player on the active
        roster (forwards + defense + goalies; non-roster excluded by default).
        Columns: name, position, age, aav, cap_hit_pct, expiry, clause,
        contract_length, source_url.
        """
        from .parsers import parse_team_roster
        slug = canonical_team_slug(team)
        url = f"{CAPWAGES_BASE}/teams/{slug}"
        html = self._fetch(url)
        return parse_team_roster(html, team=team, source_url=url)

    def refresh(self, **params):
        """Connector contract method — defaults to team roster pull.

        Usage:
            client.refresh(team='MTL') → DataFrame
            client.refresh(player='Nick Suzuki') → DataFrame (one row)
        """
        if "team" in params:
            return self.fetch_team_roster(params["team"])
        if "player" in params:
            c = self.fetch_player_contract(params["player"])
            import pandas as pd
            return pd.DataFrame([c.__dict__]) if c else pd.DataFrame()
        raise ValueError("refresh() requires either team= or player=")
