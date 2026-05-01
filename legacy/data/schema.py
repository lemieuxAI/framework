"""SQLite DDL + pydantic models. Flat schema by design — hobbyist tool, not a warehouse."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from pydantic import BaseModel

DDL = """
CREATE TABLE IF NOT EXISTS teams (
    team_id TEXT PRIMARY KEY,
    abbrev TEXT NOT NULL,
    name TEXT NOT NULL,
    conference TEXT,
    division TEXT
);

CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT,
    team_id TEXT,
    handedness TEXT
);

CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    date TEXT,
    home_id TEXT,
    away_id TEXT,
    series_id TEXT,
    game_num INTEGER,
    is_playoff INTEGER
);

CREATE TABLE IF NOT EXISTS team_stats (
    team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
    toi REAL, gp INTEGER,
    cf INTEGER, ca INTEGER, cf_pct REAL,
    ff INTEGER, fa INTEGER, ff_pct REAL,
    sf INTEGER, sa INTEGER, sf_pct REAL,
    gf INTEGER, ga INTEGER, gf_pct REAL,
    xgf REAL, xga REAL, xgf_pct REAL,
    scf INTEGER, sca INTEGER, scf_pct REAL,
    hdcf INTEGER, hdca INTEGER, hdcf_pct REAL,
    pdo REAL,
    PRIMARY KEY (team_id, season, stype, sit)
);

CREATE TABLE IF NOT EXISTS skater_stats (
    player_id TEXT, team_id TEXT, season TEXT, stype INTEGER, sit TEXT, split TEXT,
    name TEXT, position TEXT, gp INTEGER, toi REAL,
    cf INTEGER, ca INTEGER, cf_pct REAL,
    ff INTEGER, fa INTEGER, ff_pct REAL,
    xgf REAL, xga REAL, xgf_pct REAL,
    scf INTEGER, sca INTEGER, scf_pct REAL,
    hdcf INTEGER, hdca INTEGER, hdcf_pct REAL,
    gf INTEGER, ga INTEGER,
    PRIMARY KEY (player_id, team_id, season, stype, sit, split)
);

CREATE TABLE IF NOT EXISTS line_combos (
    combo_id TEXT PRIMARY KEY,
    team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
    player_ids TEXT,
    toi REAL,
    cf INTEGER, ca INTEGER, cf_pct REAL,
    xgf REAL, xga REAL, xgf_pct REAL,
    gf INTEGER, ga INTEGER
);

CREATE TABLE IF NOT EXISTS goalie_stats (
    player_id TEXT, team_id TEXT, season TEXT, stype INTEGER, sit TEXT,
    name TEXT, gp INTEGER, toi REAL,
    sv_pct REAL, hd_sv_pct REAL, gsax REAL,
    PRIMARY KEY (player_id, team_id, season, stype, sit)
);

CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT,
    team_id TEXT,
    source TEXT,
    url TEXT,
    date TEXT,
    author TEXT,
    title TEXT,
    lede TEXT,
    stance TEXT,
    entered_by TEXT,
    entered_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_contracts (
    player_name TEXT NOT NULL,
    player_slug TEXT NOT NULL,
    team TEXT,
    position TEXT,
    age INTEGER,
    contract_signed_date TEXT,
    contract_length_years INTEGER,
    aav REAL,
    cap_hit REAL,
    total_value REAL,
    expiry_status TEXT,
    clause TEXT,
    roster_group TEXT,         -- forwards, defense, goalies, non-roster
    status TEXT,                -- NHL, IR, AHL, etc
    acquired TEXT,              -- Trade, Draft, Signing, Waivers
    team_cap_hit_total REAL,    -- snapshot at fetch time
    team_cap_space REAL,
    team_upper_limit REAL,
    team_playoff_cap REAL,
    source_url TEXT,
    fetched_at TEXT,
    PRIMARY KEY (player_slug, contract_signed_date)
);
"""


class TeamStats(BaseModel):
    team_id: str
    season: str
    stype: int
    sit: str
    toi: float
    gp: int | None = None
    cf: int | None = None
    ca: int | None = None
    cf_pct: float | None = None
    ff: int | None = None
    fa: int | None = None
    ff_pct: float | None = None
    sf: int | None = None
    sa: int | None = None
    sf_pct: float | None = None
    gf: int | None = None
    ga: int | None = None
    gf_pct: float | None = None
    xgf: float | None = None
    xga: float | None = None
    xgf_pct: float | None = None
    scf: int | None = None
    sca: int | None = None
    scf_pct: float | None = None
    hdcf: int | None = None
    hdca: int | None = None
    hdcf_pct: float | None = None
    pdo: float | None = None


class SkaterStats(BaseModel):
    player_id: str
    team_id: str
    season: str
    stype: int
    sit: str
    split: str
    name: str
    position: str | None = None
    gp: int | None = None
    toi: float = 0.0
    cf: int | None = None
    ca: int | None = None
    cf_pct: float | None = None
    ff: int | None = None
    fa: int | None = None
    ff_pct: float | None = None
    xgf: float | None = None
    xga: float | None = None
    xgf_pct: float | None = None
    scf: int | None = None
    sca: int | None = None
    scf_pct: float | None = None
    hdcf: int | None = None
    hdca: int | None = None
    hdcf_pct: float | None = None
    gf: int | None = None
    ga: int | None = None


class Quote(BaseModel):
    id: int | None = None
    player_id: str | None = None
    team_id: str | None = None
    source: str
    url: str | None = None
    date: str | None = None
    author: str | None = None
    title: str | None = None
    lede: str | None = None
    stance: str = "neutral"
    entered_by: str | None = None


def init_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(DDL)
        conn.commit()
    finally:
        conn.close()


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn
