// Regression tests for lib/team_state_guard.js
// Run: node tests/team_state_guard.test.js
//
// Asserts the guard catches the "Dobeš ou Montembeault?" class of failure
// and accepts properly framed prose. No external test runner — uses node:assert.

const assert = require('node:assert');
const path = require('path');
const { runTeamStateGuard } = require('../lib/team_state_guard');

const DATA_DIR = path.join(__dirname, '..', 'data', 'team_state');
// Pin "today" to a date close to MTL.yaml.last_verified so the freshness check
// doesn't fire and pollute these unit tests.
const TODAY = new Date('2026-05-04');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    pass++;
  } catch (e) {
    console.error('  ✗ ' + name);
    console.error('     ' + (e.message || e));
    if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
    fail++;
  }
}

console.log('team_state_guard regression tests');

// --- Check 1: disjunctive goalie speculation ---
test('catches "Dobeš ou Montembeault?" — the original failure', () => {
  const prose =
    "Le filet du CH au M1. Dobeš ou Montembeault? Dobeš a éliminé Tampa avec ce qu'on a vu, mais St-Louis pourrait reposer le rookie pour le M1 de la série suivante.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  assert.ok(violations.length >= 1, 'expected at least one violation');
  const v = violations.find(x => /disjunctive goalie speculation/.test(x));
  assert.ok(v, 'expected a disjunctive-goalie-speculation violation');
  assert.ok(/Montembeault/.test(v), `expected Montembeault in violation message; got: ${v}`);
  assert.ok(/MTL\.yaml/.test(v), `expected pointer to MTL.yaml; got: ${v}`);
});

test('catches "Dobes or Montembeault?" — English variant', () => {
  const prose = "MTL net for G1. Dobes or Montembeault? Dobes eliminated Tampa.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /disjunctive goalie speculation/.test(x));
  assert.ok(v, 'expected English-variant violation');
});

test('catches "Dobeš ou Sam Montembeault?" — multi-token alias', () => {
  const prose = "Dobeš ou Sam Montembeault?";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /disjunctive goalie speculation/.test(x));
  assert.ok(v, 'expected multi-token-alias violation');
});

// --- Check 1: negative cases (should NOT fire) ---
test('passes "Dobeš (Fowler en relève)" — no demoted goalie referenced', () => {
  const prose = "Dobeš (Fowler en relève) est le partant.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /disjunctive goalie speculation/.test(x));
  assert.strictEqual(v, undefined, `unexpected disjunctive violation: ${v}`);
});

test('passes "Dobeš ou Fowler?" — both in active rotation', () => {
  const prose = "Dobeš ou Fowler? Les deux options sont valables.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /disjunctive goalie speculation/.test(x));
  assert.strictEqual(v, undefined, 'two active-rotation goalies shouldn\'t trigger');
});

// --- Check 2: inactive-player mention without inactive framing ---
test('catches Montembeault mentioned without inactive framing', () => {
  const prose = "Sam Montembeault apporte sa profondeur à l'équipe pour la prochaine série.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /inactive player.*Montembeault/.test(x));
  assert.ok(v, `expected inactive-mention violation; got: ${JSON.stringify(violations)}`);
});

test('passes "Montembeault, surclassé par Dobeš et Fowler depuis mars, ne joue pas" — framing word present', () => {
  const prose = "Montembeault, surclassé par Dobeš et Fowler depuis mars, ne joue pas en séries.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /inactive player.*Montembeault/.test(x));
  assert.strictEqual(v, undefined, `unexpected inactive violation: ${v}`);
});

test('passes "Laine est blessé et ne joue pas" — IR framing word present', () => {
  const prose = "Patrik Laine est blessé et ne joue pas pour le reste de la saison.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /inactive player.*Laine/.test(x));
  assert.strictEqual(v, undefined, `unexpected Laine inactive violation: ${v}`);
});

test('catches Laine mentioned as if he plays', () => {
  const prose = "Patrik Laine sort une saison solide et continue de produire en attaque massive.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /inactive player.*Laine/.test(x));
  assert.ok(v, 'expected Laine inactive violation when no framing present');
});

// --- Cross-team load ---
test('loads multiple teams without conflict', () => {
  const prose = "Lyon a été solide ; Hutson est notre meilleur D.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['MTL', 'BUF'], dataDir: DATA_DIR, today: TODAY,
  });
  // No violations expected — Lyon is BUF's active starter, Hutson isn't tracked
  // as inactive anywhere.
  assert.ok(Array.isArray(violations));
});

test('catches BUF inactive player without framing', () => {
  const prose = "Norris dirige la première unité avec brio.";
  const { violations } = runTeamStateGuard({
    prose, teams: ['BUF'], dataDir: DATA_DIR, today: TODAY,
  });
  const v = violations.find(x => /inactive player.*Norris/.test(x));
  assert.ok(v, 'expected Norris (BUF, IR) inactive violation');
});

// --- Freshness checks ---
test('warns when team_state is stale (>7 days)', () => {
  const futureDay = new Date('2026-05-13'); // 9 days after MTL.last_verified
  const { warnings, violations } = runTeamStateGuard({
    prose: '', teams: ['MTL'], dataDir: DATA_DIR, today: futureDay,
  });
  assert.ok(warnings.some(w => /MTL/.test(w) && /days old/.test(w)), 'expected staleness warning');
  // 9 days is below the 21-day abort threshold, so no freshness violation.
  assert.strictEqual(violations.find(v => /not verified for/.test(v)), undefined);
});

test('aborts when team_state is very stale (>21 days)', () => {
  const futureDay = new Date('2026-06-01'); // ~28 days after MTL.last_verified
  const { violations } = runTeamStateGuard({
    prose: '', teams: ['MTL'], dataDir: DATA_DIR, today: futureDay,
  });
  assert.ok(violations.some(v => /not verified for/.test(v)), 'expected freshness abort');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
