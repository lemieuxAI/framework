// team_state_guard.js — build-time prose guard against stale-knowledge LLM hallucinations.
//
// Loads data/team_state/<TEAM>.yaml and runs two checks against a prose corpus:
//
//   1. Disjunctive goalie speculation — "X ou Y?" / "X or Y?" patterns where
//      one of the names is a goalie outside the active_rotation. Catches
//      "Dobeš ou Montembeault?" and similar.
//
//   2. Inactive-player mention without inactive framing — any name in
//      effectively_inactive[] appearing in prose without one of its
//      framing_words within ±15 tokens.
//
// API:
//   const { runTeamStateGuard } = require('../../lib/team_state_guard');
//   const result = runTeamStateGuard({
//     prose: '<combined corpus string>',
//     teams: ['MTL', 'BUF'],
//     dataDir: path.join(__dirname, '../../data/team_state'),
//   });
//   // result = { violations: [string], warnings: [string] }
//   // Caller is responsible for process.exit(7) on violations.length > 0.

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const FRAME_WINDOW_TOKENS = 15;
const VERIFY_WARN_DAYS = 7;
const VERIFY_ABORT_DAYS = 21;

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(s) {
  return stripDiacritics(s).toLowerCase().trim();
}

function loadTeamState(team, dataDir) {
  const file = path.join(dataDir, `${team}.yaml`);
  if (!fs.existsSync(file)) {
    throw new Error(`team_state file not found: ${file}`);
  }
  const doc = yaml.parse(fs.readFileSync(file, 'utf8'));
  doc._sourcePath = file;
  return doc;
}

// Build a lookup of every alias → canonical { name, team, kind: 'goalie' | 'inactive', ts }.
// Each canonical name AND each declared alias contributes an entry.
function buildAliasIndex(states) {
  const index = []; // [{ aliasNorm, canonical, team, role: 'goalie_active' | 'goalie_demoted' | 'inactive', record, ts }]
  for (const ts of states) {
    const goalies = (ts.depth_chart && ts.depth_chart.goalies) || {};
    const aliases = (goalies.aliases) || {};
    const active = new Set(goalies.active_rotation || []);
    const demoted = new Set(goalies.demoted || []);

    const addGoalie = (canonical, role) => {
      const variants = new Set([canonical, ...(aliases[canonical] || [])]);
      for (const v of variants) {
        index.push({
          aliasNorm: normalize(v),
          alias: v,
          canonical, team: ts.team, role,
          record: { canonical, role }, ts,
        });
      }
    };
    for (const g of active) addGoalie(g, 'goalie_active');
    for (const g of demoted) addGoalie(g, 'goalie_demoted');

    for (const inactive of (ts.effectively_inactive || [])) {
      const variants = new Set([inactive.name, ...(inactive.aliases || [])]);
      // Inactive entries don't define their own aliases unless added; fall back to
      // depth_chart aliases when canonical matches there.
      if (aliases[inactive.name]) for (const a of aliases[inactive.name]) variants.add(a);
      for (const v of variants) {
        index.push({
          aliasNorm: normalize(v),
          alias: v,
          canonical: inactive.name, team: ts.team, role: 'inactive',
          record: inactive, ts,
        });
      }
    }
  }
  return index;
}

// Tokenize on whitespace, preserving original tokens for window framing checks.
function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

// Find every position where `aliasNorm` appears as a contiguous run of tokens
// in `tokensNorm`. Returns array of { startIdx, endIdx } in token-space.
function findTokenRuns(tokensNorm, aliasNorm) {
  const aliasTokens = aliasNorm.split(/\s+/).filter(Boolean);
  if (aliasTokens.length === 0) return [];
  const runs = [];
  for (let i = 0; i + aliasTokens.length <= tokensNorm.length; i++) {
    let ok = true;
    for (let j = 0; j < aliasTokens.length; j++) {
      // Strip trailing punctuation from the prose token before comparing.
      const proseTok = tokensNorm[i + j].replace(/[.,;:!?'"()\[\]]+$/g, '').replace(/^[.,;:!?'"()\[\]]+/g, '');
      if (proseTok !== aliasTokens[j]) { ok = false; break; }
    }
    if (ok) runs.push({ startIdx: i, endIdx: i + aliasTokens.length - 1 });
  }
  return runs;
}

function checkDisjunctiveGoalieSpeculation(prose, aliasIndex) {
  // Match "<Name1> ou <Name2>?" or "<Name1> or <Name2>?", possibly with
  // accented characters. Names are 1-3 tokens of letters/diacritics.
  const violations = [];
  const re = /(\b[A-ZÀ-ÿĀ-ž][\wÀ-ÿĀ-ž'\-]+(?:\s+[A-ZÀ-ÿĀ-ž][\wÀ-ÿĀ-ž'\-]+){0,2})\s+(ou|or)\s+([A-ZÀ-ÿĀ-ž][\wÀ-ÿĀ-ž'\-]+(?:\s+[A-ZÀ-ÿĀ-ž][\wÀ-ÿĀ-ž'\-]+){0,2})\s*\?/g;
  let m;
  while ((m = re.exec(prose)) !== null) {
    const [full, name1, , name2] = m;
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    const e1 = aliasIndex.find(e => e.aliasNorm === n1);
    const e2 = aliasIndex.find(e => e.aliasNorm === n2);
    // Both must resolve to goalies (active or demoted) to be a "starter speculation".
    const isGoalie = e => e && (e.role === 'goalie_active' || e.role === 'goalie_demoted');
    if (!isGoalie(e1) || !isGoalie(e2)) continue;
    if (e1.team !== e2.team) continue; // cross-team comparisons aren't depth-chart speculation
    // If either is demoted, that's a violation — disjunctive speculation
    // implies both names are plausible starters, but a demoted goalie isn't.
    if (e1.role === 'goalie_demoted' || e2.role === 'goalie_demoted') {
      const demoted = (e1.role === 'goalie_demoted' ? e1 : e2);
      violations.push(
        `[VIOLATION] disjunctive goalie speculation "${full.trim()}" — ` +
        `${demoted.canonical} is in ${demoted.team}.depth_chart.goalies.demoted ` +
        `(see ${demoted.ts._sourcePath})`
      );
    }
  }
  return violations;
}

function checkInactiveMentionWithoutFraming(prose, aliasIndex) {
  const violations = [];
  const tokensRaw = tokenize(prose);
  const tokensNorm = tokensRaw.map(t => normalize(t));

  // Group inactive entries so we only report each canonical name once per location.
  const reported = new Set();

  for (const entry of aliasIndex) {
    if (entry.role !== 'inactive') continue;
    const aliasNorm = entry.aliasNorm;
    if (!aliasNorm) continue;
    const runs = findTokenRuns(tokensNorm, aliasNorm);
    if (runs.length === 0) continue;

    const framingWords = (entry.record.framing_words || []).map(normalize);

    for (const run of runs) {
      const winStart = Math.max(0, run.startIdx - FRAME_WINDOW_TOKENS);
      const winEnd = Math.min(tokensNorm.length - 1, run.endIdx + FRAME_WINDOW_TOKENS);
      // Strip punctuation off each token for clean word-boundary matching, then
      // check if any framing phrase appears as a whole-word substring (the
      // phrase itself can be multi-word, e.g. "out of rotation").
      const winTokensClean = tokensNorm.slice(winStart, winEnd + 1).map(
        t => t.replace(/[^\p{L}\p{N}\-']+/gu, ''),
      ).filter(Boolean);
      const window = ' ' + winTokensClean.join(' ') + ' ';
      const hasFraming = framingWords.some(fw => {
        if (!fw) return false;
        // Match the framing phrase with whitespace boundaries so e.g. "ir"
        // doesn't match "produire" / "dirige".
        return window.includes(' ' + fw + ' ');
      });
      if (hasFraming) continue;

      // Build a readable excerpt from the raw tokens.
      const excerptStart = Math.max(0, run.startIdx - 8);
      const excerptEnd = Math.min(tokensRaw.length - 1, run.endIdx + 8);
      const excerpt = tokensRaw.slice(excerptStart, excerptEnd + 1).join(' ');

      const key = `${entry.canonical}@${run.startIdx}`;
      if (reported.has(key)) continue;
      reported.add(key);

      violations.push(
        `[VIOLATION] inactive player "${entry.canonical}" mentioned without inactive framing — ` +
        `reason: ${entry.record.reason}; excerpt: "...${excerpt}..." ` +
        `(see ${entry.ts._sourcePath}#effectively_inactive)`
      );
    }
  }
  return violations;
}

function checkVerificationFreshness(states, today = new Date()) {
  const warnings = [];
  const violations = [];
  for (const ts of states) {
    if (!ts.last_verified) continue;
    const verified = new Date(ts.last_verified);
    const ageDays = (today - verified) / (1000 * 60 * 60 * 24);
    if (ageDays > VERIFY_ABORT_DAYS) {
      violations.push(
        `[VIOLATION] team_state for ${ts.team} not verified for ${ageDays.toFixed(0)} days ` +
        `(${ts._sourcePath} last_verified=${ts.last_verified}); re-verify before building`
      );
    } else if (ageDays > VERIFY_WARN_DAYS) {
      warnings.push(
        `team_state for ${ts.team} is ${ageDays.toFixed(0)} days old (${ts.last_verified}); ` +
        `consider refreshing data/team_state/${ts.team}.yaml`
      );
    }
  }
  return { warnings, violations };
}

function runTeamStateGuard({ prose, teams, dataDir, today }) {
  if (typeof prose !== 'string') throw new Error('prose must be a string');
  if (!Array.isArray(teams)) throw new Error('teams must be an array of team codes');
  if (!dataDir) throw new Error('dataDir is required');

  const states = teams.map(t => loadTeamState(t, dataDir));
  const aliasIndex = buildAliasIndex(states);

  const violations = [];
  const warnings = [];

  violations.push(...checkDisjunctiveGoalieSpeculation(prose, aliasIndex));
  violations.push(...checkInactiveMentionWithoutFraming(prose, aliasIndex));

  const fresh = checkVerificationFreshness(states, today);
  warnings.push(...fresh.warnings);
  violations.push(...fresh.violations);

  return { violations, warnings };
}

module.exports = {
  runTeamStateGuard,
  // exposed for tests
  _internal: {
    normalize, stripDiacritics, tokenize, findTokenRuns,
    buildAliasIndex, loadTeamState,
    checkDisjunctiveGoalieSpeculation, checkInactiveMentionWithoutFraming,
  },
};
