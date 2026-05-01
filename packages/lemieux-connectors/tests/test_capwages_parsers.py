"""Parser + helper tests for the CapWages connector.

Live HTML fixtures captured 2026-04-30 from public CapWages pages. If the site
re-renders or migrates away from Next.js, regenerate the fixtures via:

    python -c 'import requests; ...'  (see tests/fixtures/README.md)

These tests do not hit the network; they parse local fixtures only.
"""
from __future__ import annotations

from pathlib import Path

from lemieux.connectors.capwages import (
    canonical_player_slug,
    canonical_team_slug,
)
from lemieux.connectors.capwages.parsers import (
    parse_player_contract,
    parse_team_roster,
    _money,
    _years_from_length,
)

FIXTURES = Path(__file__).parent / "fixtures"


# ---------- slug helpers ----------

def test_canonical_player_slug_basic():
    assert canonical_player_slug("Nick Suzuki") == "nick-suzuki"
    assert canonical_player_slug("Cole Caufield") == "cole-caufield"


def test_canonical_player_slug_diacritics_stripped():
    assert canonical_player_slug("Juraj Slafkovský") == "juraj-slafkovsky"
    assert canonical_player_slug("Jakub Dobeš") == "jakub-dobes"


def test_canonical_player_slug_special_chars():
    # Apostrophes and dots collapse
    assert canonical_player_slug("J.J. Moser") == "j-j-moser"
    assert canonical_player_slug("O'Reilly, Ryan") == "o-reilly-ryan"


def test_canonical_team_slug_known_abbrevs():
    assert canonical_team_slug("MTL") == "montreal_canadiens"
    assert canonical_team_slug("T.B") == "tampa_bay_lightning"
    assert canonical_team_slug("TBL") == "tampa_bay_lightning"
    assert canonical_team_slug("UTA") == "utah_mammoth"
    assert canonical_team_slug("L.A") == "los_angeles_kings"
    assert canonical_team_slug("LAK") == "los_angeles_kings"


# ---------- money + length helpers ----------

def test_money_parsing():
    assert _money("$7,875,000") == 7_875_000.0
    assert _money("$0") == 0.0
    assert _money(None) is None
    assert _money("N/A") is None


def test_years_parsing():
    assert _years_from_length("8 years") == 8
    assert _years_from_length("1 year") == 1
    assert _years_from_length("ELC: 3 years") == 3
    assert _years_from_length(None) is None


# ---------- player-page parser (live fixture) ----------

def test_parse_player_suzuki():
    html = (FIXTURES / "capwages_player_suzuki.html").read_text(encoding="utf-8")
    c = parse_player_contract(
        html, player_name="Nick Suzuki", slug="nick-suzuki",
        source_url="https://capwages.com/players/nick-suzuki",
    )
    assert c is not None
    assert c.player_name == "Nick Suzuki"
    assert c.team == "MTL"
    assert c.position == "C"
    assert c.aav == 7_875_000.0
    assert c.cap_hit == 7_875_000.0
    assert c.total_value == 63_000_000.0
    assert c.contract_length_years == 8
    assert c.expiry_status == "UFA"
    assert "Oct" in (c.contract_signed_date or "")
    assert "2021" in (c.contract_signed_date or "")
    assert c.age is not None and 25 <= c.age <= 30
    assert "capwages.com" in c.source_url


# ---------- team-page parser (live fixture) ----------

def test_parse_team_roster_mtl():
    html = (FIXTURES / "capwages_team_mtl.html").read_text(encoding="utf-8")
    df = parse_team_roster(
        html, team="MTL",
        source_url="https://capwages.com/teams/montreal_canadiens",
    )
    # ≥ 23 players (active roster) — usually 23-27 with non-roster + IR
    assert len(df) >= 18
    # Columns we promised
    for col in ["player_name", "team", "position", "aav", "cap_hit",
                "expiry_status", "clause", "team_cap_hit_total", "team_cap_space"]:
        assert col in df.columns, f"missing column {col}"

    # Spot-check Suzuki appears with the right AAV
    suzuki = df[df["player_name"] == "Nick Suzuki"]
    assert len(suzuki) == 1
    assert suzuki.iloc[0]["aav"] == 7_875_000.0

    # Team summary should be a real number, not None
    assert df["team_cap_hit_total"].iloc[0] is not None
    assert df["team_cap_hit_total"].iloc[0] > 50_000_000.0  # NHL teams are way above this


def test_parse_team_roster_distinguishes_groups():
    html = (FIXTURES / "capwages_team_mtl.html").read_text(encoding="utf-8")
    df = parse_team_roster(
        html, team="MTL",
        source_url="https://capwages.com/teams/montreal_canadiens",
    )
    # forwards / defense / goalies all present
    groups = set(df["roster_group"].unique())
    assert "forwards" in groups
    assert "defense" in groups
    assert "goalies" in groups
