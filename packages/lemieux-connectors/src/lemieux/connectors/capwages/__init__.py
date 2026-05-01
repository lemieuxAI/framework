"""CapWages connector — NHL contract + salary cap data.

CapWages.com emerged after the CapFriendly shutdown (late 2024) and provides
public-facing pages with contract terms, AAV / cap hits, year-by-year salary
breakdowns, NTC/NMC clauses, expiry status (UFA/RFA), and team-level cap
totals.

License: public site, robots.txt is permissive (Allow: /). We respect the
spirit anyway — polite rate limit (default 1 req/sec), aggressive caching,
no redistribution of raw tables. Citing CapWages as source for any derived
analysis.

Two endpoints are stable:
  - /teams/<slug>            — full team roster with contracts
  - /players/<lastname-firstname>  — one player's contract history

Players slugs are deterministic: lowercase first + last separated by '-',
diacritics stripped (Slafkovský → slafkovsky).

This connector exposes:
  - CapWagesClient.fetch_team_roster(team_slug) → DataFrame
  - CapWagesClient.fetch_player_contract(player_slug) → PlayerContract dataclass
  - canonical_team_slug(team_abbrev) helper
  - canonical_player_slug(name) helper

License notes documented in SOURCES.md.
"""
from .client import (
    CapWagesClient,
    PlayerContract,
    canonical_player_slug,
    canonical_team_slug,
    CAPWAGES_CONNECTOR_META,
)

__all__ = [
    "CapWagesClient",
    "PlayerContract",
    "canonical_player_slug",
    "canonical_team_slug",
    "CAPWAGES_CONNECTOR_META",
]
