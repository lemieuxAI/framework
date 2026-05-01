"""Refresh contract data for one or more NHL teams via CapWages.

Pulls the active roster (forwards + defense + goalies) for each team and
upserts into the `player_contracts` table.

Usage:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python tools/refresh_salary_cap.py
        [--teams MTL,T.B,EDM]   # default: all 32 teams
        [--rate-limit-s 1.5]
        [--print-summary]

Default rate limit (1 req/s) gives a ~30-50s full-league sweep with
caching. Subsequent runs hit the local cache (24h TTL) and complete
instantly.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "lemieux-connectors" / "src"))
sys.path.insert(0, str(REPO / "legacy"))

import truststore
truststore.inject_into_ssl()

from lemieux.connectors.capwages import CapWagesClient

DB_PATH = REPO / "legacy" / "data" / "store.sqlite"

ALL_TEAMS = [
    "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ",
    "DAL", "DET", "EDM", "FLA", "L.A", "MIN", "MTL", "NSH",
    "N.J", "NYI", "NYR", "OTT", "PHI", "PIT", "S.J", "SEA",
    "STL", "T.B", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG",
]


def init_table(con: sqlite3.Connection) -> None:
    # PK on player_slug only: each refresh replaces the player's current
    # contract row. If we want contract history later, add a separate
    # `contract_history` table.
    con.execute("""
        CREATE TABLE IF NOT EXISTS player_contracts (
            player_slug TEXT PRIMARY KEY,
            player_name TEXT NOT NULL,
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
            roster_group TEXT,
            status TEXT,
            acquired TEXT,
            team_cap_hit_total REAL,
            team_cap_space REAL,
            team_upper_limit REAL,
            team_playoff_cap REAL,
            source_url TEXT,
            fetched_at TEXT
        )
    """)
    # Migrate from the old (slug, signed_date) PK if present
    cur = con.execute("PRAGMA table_info(player_contracts)").fetchall()
    has_old_pk = any(row[5] == 2 and row[1] == "contract_signed_date" for row in cur)
    if has_old_pk:
        con.execute("ALTER TABLE player_contracts RENAME TO _player_contracts_old")
        con.execute("""
            CREATE TABLE player_contracts (
                player_slug TEXT PRIMARY KEY,
                player_name TEXT NOT NULL,
                team TEXT, position TEXT, age INTEGER,
                contract_signed_date TEXT, contract_length_years INTEGER,
                aav REAL, cap_hit REAL, total_value REAL,
                expiry_status TEXT, clause TEXT,
                roster_group TEXT, status TEXT, acquired TEXT,
                team_cap_hit_total REAL, team_cap_space REAL,
                team_upper_limit REAL, team_playoff_cap REAL,
                source_url TEXT, fetched_at TEXT
            )
        """)
        con.execute("""
            INSERT OR REPLACE INTO player_contracts
            SELECT player_slug, player_name, team, position, age,
                   contract_signed_date, contract_length_years,
                   aav, cap_hit, total_value, expiry_status, clause,
                   roster_group, status, acquired,
                   team_cap_hit_total, team_cap_space,
                   team_upper_limit, team_playoff_cap,
                   source_url, fetched_at
            FROM _player_contracts_old
        """)
        con.execute("DROP TABLE _player_contracts_old")
    con.commit()


def upsert_team(con: sqlite3.Connection, df) -> int:
    """Insert/replace one team's contract rows."""
    cols = [
        "player_name", "player_slug", "team", "position", "age",
        "contract_signed_date", "contract_length_years",
        "aav", "cap_hit", "total_value",
        "expiry_status", "clause", "roster_group", "status", "acquired",
        "team_cap_hit_total", "team_cap_space", "team_upper_limit", "team_playoff_cap",
        "source_url", "fetched_at",
    ]
    n = 0
    for _, r in df.iterrows():
        # Some columns may be missing depending on row variety; default to None
        params = []
        for c in cols:
            v = r.get(c) if c in df.columns else None
            # pandas may return NaN — coerce to None for SQLite
            if v is not None and v != v:  # NaN check
                v = None
            params.append(v)
        con.execute(f"""
            INSERT OR REPLACE INTO player_contracts ({', '.join(cols)})
            VALUES ({', '.join(['?'] * len(cols))})
        """, params)
        n += 1
    con.commit()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teams", default=None,
                    help="Comma-separated team abbreviations. Default: all 32 NHL teams.")
    ap.add_argument("--rate-limit-s", type=float, default=1.0)
    ap.add_argument("--print-summary", action="store_true",
                    help="Print top contracts per team after refresh.")
    args = ap.parse_args()

    teams = [t.strip() for t in args.teams.split(",")] if args.teams else ALL_TEAMS

    client = CapWagesClient(rate_per_sec=1.0 / max(args.rate_limit_s, 0.1))
    con = sqlite3.connect(DB_PATH, timeout=60)
    init_table(con)

    total_rows = 0
    failures: list[str] = []
    for team in teams:
        try:
            df = client.fetch_team_roster(team)
            n = upsert_team(con, df)
            total_rows += n
            print(f"  {team:5s}  {n:>3} rows  cap=${df['team_cap_hit_total'].iloc[0]:>12,.0f}  space=${df['team_cap_space'].iloc[0]:>12,.0f}")
            if args.print_summary:
                top = df.sort_values("aav", ascending=False).head(3)
                for _, r in top.iterrows():
                    print(f"    top  {r['player_name']:25s}  AAV=${r['aav']:>10,.0f}  expiry={r['expiry_status']}")
        except Exception as e:
            print(f"  {team:5s}  FAILED: {e}")
            failures.append(team)

    client.close()
    con.close()

    print()
    print(f"Done. {total_rows} rows persisted across {len(teams) - len(failures)} teams.")
    if failures:
        print(f"Failures: {failures}")
        sys.exit(1)


if __name__ == "__main__":
    main()
