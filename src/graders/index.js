/**
 * Graders: they turn one model reply into a score.
 *
 * All three are deterministic - a number compared against the oracle within a
 * tolerance, or an action compared against a chart. None of them asks a model
 * to judge another model, which is what makes a run reproducible and free to
 * re-grade from the cached replies.
 *
 * Every grader returns the same envelope:
 *
 *   pass       did it meet the bar for this case
 *   error      the graded distance from truth, in the case's own units
 *   detail     a short human-readable line for the failure list
 *   recovered  the model ignored the output contract and the value came from prose
 *
 * `error` matters as much as `pass`. A binary verdict cannot tell a near miss
 * from a catastrophe, and the difference between "2 points out" and "40 points
 * out" is most of what you want to know when comparing two models.
 */
import { parseAnswer } from '../protocol.js';
import { getAction, getFrequencies } from '../oracle/ranges.js';

function unparseable(kase, parsed) {
  return {
    id: kase.id,
    type: kase.type,
    pass: false,
    error: null,
    recovered: false,
    unparseable: true,
    detail: `no answer could be read from the reply: ${parsed.error}`,
  };
}

/** Equity, in percentage points of absolute error. */
function gradeEquity(kase, parsed) {
  const expectedPct = kase.expected * 100;
  const got = parsed.value;
  const error = Math.abs(got - expectedPct);
  const tolerance = kase.tolerancePct ?? 2;
  return {
    id: kase.id,
    type: 'equity',
    pass: error <= tolerance,
    error,
    unit: 'percentage points',
    expected: expectedPct,
    got,
    recovered: parsed.recovered,
    detail: `said ${got.toFixed(1)}%, truth ${expectedPct.toFixed(1)}% (${error.toFixed(1)}pp out, tolerance ${tolerance})`,
  };
}

/** ICM, by the largest absolute error across seats. */
function gradeIcm(kase, parsed) {
  const got = parsed.value;
  const expected = kase.expected;
  let worst = 0;
  let worstSeat = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.abs(got[i] - expected[i]);
    if (e > worst) { worst = e; worstSeat = i; }
  }
  // A tolerance proportional to the prize pool: an absolute one would be
  // trivially easy on a big pool and impossible on a small one.
  const pool = kase.payouts.reduce((a, b) => a + b, 0);
  const tolerance = kase.tolerance ?? pool * 0.02;
  return {
    id: kase.id,
    type: 'icm',
    pass: worst <= tolerance,
    error: worst,
    unit: kase.currency ?? 'chips',
    expected,
    got,
    recovered: parsed.recovered,
    detail: `worst seat ${worstSeat + 1}: said ${got[worstSeat].toFixed(1)}, truth ${expected[worstSeat].toFixed(1)} (${worst.toFixed(1)} out, tolerance ${tolerance.toFixed(1)})`,
  };
}

/**
 * Preflop action, against the chart.
 *
 * Mixed strategies are the interesting case: where the chart raises a hand 60%
 * and folds it 40%, both answers are defensible, so anything the chart plays
 * with a non-zero frequency passes - and the frequency is reported, so a model
 * that always picks the 5% branch is still visible in the numbers.
 */
function gradeRange(kase, parsed) {
  const entry = kase.entry;
  const freqs = getFrequencies(entry);
  const primary = getAction(entry);
  const got = parsed.value;
  const freq = freqs[got] ?? 0;
  const mixed = Object.values(freqs).filter((f) => f > 0).length > 1;
  return {
    id: kase.id,
    type: 'range',
    pass: freq > 0,
    // Distance from the chart's own most-frequent action, in frequency points.
    error: (freqs[primary] ?? 0) - freq,
    unit: 'frequency points',
    expected: primary,
    got,
    mixed,
    frequency: freq,
    recovered: parsed.recovered,
    detail: mixed
      ? `said ${got}, chart plays it ${freq}% of the time (most frequent: ${primary} at ${freqs[primary]}%)`
      : `said ${got}, chart says ${primary}`,
  };
}

const GRADERS = { equity: gradeEquity, icm: gradeIcm, range: gradeRange };

/** Grade one case against one raw reply. */
export function grade(kase, replyText) {
  const grader = GRADERS[kase.type];
  if (!grader) throw new Error(`no grader for case type ${kase.type}`);
  const parsed = parseAnswer(kase, replyText);
  if (parsed.error) return unparseable(kase, parsed);
  return grader(kase, parsed);
}

/**
 * Why a call produced no reply, for rows written before runs recorded it.
 * Only the truncation message needs recognising; anything else failed as a
 * request.
 */
function errorKindOf(row) {
  if (row.errorKind) return row.errorKind;
  return /truncated at the output cap/.test(row.error) ? 'truncated' : 'request';
}

/**
 * Grade one stored run row, which may hold an error instead of a reply.
 *
 * The two kinds of error are kept apart because they mean opposite things.
 * `truncated` is the model's failure: it was given a generous output budget
 * and spent all of it without answering, so it fails the case, in a column
 * of its own. `request` is the harness's failure - a bad key, an empty
 * account, a network fault - and says nothing about the model at all. Both
 * used to be graded as an unreadable reply, which is how a run against an
 * account with no credits once came out as "0/75, unreadable x75".
 */
export function gradeRow(kase, row) {
  if (!row.error) return grade(kase, row.text);
  const kind = errorKindOf(row);
  return {
    id: kase.id,
    type: kase.type,
    pass: false,
    error: null,
    recovered: false,
    ...(kind === 'truncated' ? { truncated: true } : { requestFailed: true }),
    detail: kind === 'truncated'
      ? 'no answer: the model used its whole output budget without replying'
      : `request failed, so the model was never graded: ${row.error.slice(0, 160)}`,
  };
}

/**
 * Roll a list of graded results into the numbers a report shows.
 *
 * Pass rate is reported per type as well as overall, because the types are not
 * comparable: a model can be strong on chart lookups and hopeless at equity
 * arithmetic, and one blended percentage would hide that completely.
 */
export function summarise(results) {
  const byType = new Map();
  for (const r of results) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push(r);
  }
  const block = (rows) => {
    const scored = rows.filter((r) => !r.unparseable && r.error !== null);
    const errors = scored.map((r) => r.error);
    return {
      n: rows.length,
      passed: rows.filter((r) => r.pass).length,
      passRate: rows.length ? rows.filter((r) => r.pass).length / rows.length : 0,
      unparseable: rows.filter((r) => r.unparseable).length,
      truncated: rows.filter((r) => r.truncated).length,
      requestFailed: rows.filter((r) => r.requestFailed).length,
      recovered: rows.filter((r) => r.recovered).length,
      meanError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
      maxError: errors.length ? Math.max(...errors) : null,
      unit: rows.find((r) => r.unit)?.unit ?? null,
    };
  };
  return {
    overall: block(results),
    byType: Object.fromEntries([...byType].map(([t, rows]) => [t, block(rows)])),
  };
}

/**
 * Compare a run against a baseline, case by case.
 *
 * The regressions list is the reason this tool exists rather than a script that
 * prints a percentage: an average can improve while specific cases break, and
 * those are the ones worth looking at.
 */
export function diffRuns(baseline, current) {
  const was = new Map(baseline.map((r) => [r.id, r]));
  const regressions = [];
  const fixes = [];
  for (const now of current) {
    const before = was.get(now.id);
    if (!before) continue;
    if (before.pass && !now.pass) regressions.push({ id: now.id, type: now.type, detail: now.detail });
    if (!before.pass && now.pass) fixes.push({ id: now.id, type: now.type, detail: now.detail });
  }
  return {
    regressions,
    fixes,
    only_in_current: current.filter((r) => !was.has(r.id)).map((r) => r.id),
    only_in_baseline: baseline.filter((r) => !current.some((c) => c.id === r.id)).map((r) => r.id),
  };
}
