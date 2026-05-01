# Data sources — terms & caveats

This file lists every data source Lemieux actually connects to today. Sources we'd like to integrate later are documented in [ROADMAP.md](./ROADMAP.md). If a source's terms change, update here first; the connector follows.

**Rule of thumb**: Lemieux is MIT-licensed code. The data is NOT. Respect each source's terms, rate limits, robots.txt, and redistribution policy. When in doubt, link out rather than republish.

---

## NHL.com — public API (`api-web.nhle.com` / `api.nhle.com/stats`)

- **What's there**: Play-by-play, shift charts, rosters, schedules, standings, gamecenter, NHL Edge biometrics (shot speed, skate speed, burst counts).
- **Access**: Free, undocumented, unauthenticated. No API key required.
- **Rate limit**: Unofficial. Community practice: ≤10 req/sec sustained, cache aggressively.
- **Redistribution**: Not for commercial redistribution. Citing counts, linking to NHL.com, and caching for personal/analytic use are fine.
- **Stability**: Unofficial. Endpoints can change without notice. Schema drift is a real risk — we abstract via a connector and test nightly.
- **Docs (community)**: [Zmalski/NHL-API-Reference](https://github.com/Zmalski/NHL-API-Reference), [dword4/nhlapi](https://github.com/dword4/nhlapi)
- **Connectors**: `lemieux-connectors/nhl_api` (PBP/shifts/rosters), `lemieux-connectors/nhl_edge` (biometrics)
- **Safe to cache**: Yes, indefinitely for game-completed data.

## Natural Stat Trick (`data.naturalstattrick.com`)

- **What's there**: Team + skater + goalie advanced stats, line combinations, defensive pairs, per-strength-state splits, historical data back to 2007-08.
- **Access**: Requires a personal access key requested via an NST user profile. Free (donations accepted), not a paid tier.
- **Rate limit**: Community norm ~1 req/sec with polite backoff. NST's scraping policy at [naturalstattrick.com/scraping.php](https://www.naturalstattrick.com/scraping.php) explicitly authorizes automated traffic on `data.naturalstattrick.com` with a key; main site is strictly controlled.
- **Redistribution**: Do NOT redistribute raw tables. Derived analyses that cite NST are expected and welcomed.
- **Connector**: `lemieux-connectors/nst`
- **Safe to cache**: Yes; TTL by staleness (live games 6h, completed 7d, historical 30d).
- **Key handling**: Each user supplies their own key via `.env`. Never commit a key. Never share across users.

## CapWages (`capwages.com`)

- **What's there**: NHL contract + salary cap data — AAV, current-season cap hit, year-by-year salary breakdown, total contract value, expiry status (UFA/RFA), clauses (NMC / M-NTC / NTC / 10-team etc.), signing dates, signing teams. Team pages also surface team-level totals (cap hit, cap space, playoff cap, upper / lower limits).
- **Access**: Free, public-facing site. No API key. Server-rendered Next.js pages with a `__NEXT_DATA__` JSON blob that the connector parses (much more stable than HTML-table scraping).
- **Rate limit**: `robots.txt` permits all crawlers (`Allow: /`). We default to 1 req/sec with 24h cache TTL — the data changes only on signing days. Be polite anyway.
- **Redistribution**: Cite source. Do not republish raw tables. Derived analyses (e.g., "this swap is cap-illegal" callouts in the swap engine) are the intended use.
- **Connector**: `lemieux-connectors/capwages`
- **Safe to cache**: Yes; default 24h TTL.
- **Stability**: Site is run by a small operator post-CapFriendly. If they migrate away from Next.js, the parser will raise a clear error pointing at the missing `__NEXT_DATA__` script tag.

## DuckDuckGo search + Anthropic API — for the GenAI scouting layer

- **What's there**: DDG returns short snippets from public web pages (player profiles, beat coverage, scouting reports). Anthropic's Claude Sonnet 4.5 extracts a structured JSON profile (continuous attributes + archetype tags + comparable mentions) from those snippets.
- **Access**: DDG is free and unauthenticated. Anthropic requires an `ANTHROPIC_API_KEY` (paid; ~$30 in API calls to build the full skater corpus once).
- **Rate limit**: Polite delay between players (default 0.5–1 s); the script is idempotent so partial runs are safe.
- **Redistribution**: We cache the *extracted structured output* (not the source pages). Each extracted tag carries its verbatim `source_quote` and `source_url`; do not strip that provenance when republishing the scouting tables.
- **Tools**: `tools/build_scouting_corpus.py`, `tools/build_goalie_scouting_corpus.py`, `tools/refresh_scouting_empties.py`
- **Key handling**: `ANTHROPIC_API_KEY` lives in `.env`. Never commit it.

---

## General stance

- **Respect robots.txt.** If a source's robots.txt disallows a path, we don't scrape it, period.
- **Respect rate limits.** Our rate limiter defaults are conservative; users override at their own risk.
- **Never bypass paywalls.** Subscription-gated sources require user-supplied credentials/data.
- **Cache aggressively.** One fetch per unique query per TTL window. Don't be a jerk to upstream providers.
- **Fail visibly.** If a source returns an unexpected schema, connectors raise a clear error and log the first diff — so you know something changed rather than silently ingesting garbage.

---

## Derived artifacts — what Lemieux owns and can redistribute

The data layer at `legacy/data/store.sqlite` mixes raw third-party tables (NST, NHL.com Edge) with derived artifacts (kNN embeddings, LLM-extracted scouting) that Lemieux owns. The DB itself is **not redistributable** because of the raw layers, but the derived layers are:

- **Comparable indexes** (`legacy/data/comparable_index.json`, `legacy/data/goalie_comparable_index.json`) — PCA-whitened embeddings + fitted parameters of our kNN model. These are the model itself, not raw NST tables.
- **Scouting corpus** (`scouting_profiles`, `scouting_attributes`, `scouting_tags`, `scouting_comparable_mentions`) — LLM-extracted from public web scouting text via our prompts. Each tag carries its verbatim source quote and source URL; do not strip provenance when republishing.
- **Schema dump** — `CREATE TABLE` statements only; downstream users repopulate raw layers themselves with their own NST key.

Use `tools/export_derived_artifacts.py` to produce a redistributable zip with these alongside a SOURCES note. The exporter explicitly excludes the NST tables.

---

## Future sources

Sources we'd like to integrate but haven't yet (MoneyPuck for cross-validation, PWHL for women's-league coverage, EliteProspects for cross-league prospect comps, Hockey-Reference for historical depth, All Three Zones for hand-tracked microstats, etc.) live in [ROADMAP.md](./ROADMAP.md) under "Future data sources."

If a source operator contacts us asking that we remove a connector or change behaviour, we do so without argument. Open an issue to report any concern.
