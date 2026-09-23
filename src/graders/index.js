/**
 * Grading: one model reply becomes one score, and a run becomes numbers a
 * report can show.
 *
 * The scoring itself belongs to the suite - only it knows what a case's units
 * are and how close is close enough. What lives here is everything that must
 * behave the same whatever the domain: the envelope every result carries, the
 * three kinds of non-answer, the roll-up, and the baseline diff.
 *
 * Every result carries:
 *
 *   pass       did it meet the bar for this case
 *   error      the graded distance from truth, in the case's own units
 *   unit       what those units are
 *   detail     a short human-readable line for the failure list
 *   recovered  the model ignored the output contract
 *
 * `error` matters as much as `pass`. A binary verdict cannot tell a near miss
 * from a catastrophe, and the difference between "2 points out" and "40 points
 * out" is most of what you want to know when comparing two models.
 */
import { parseAnswer } from '../protocol.js';

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

/** Grade one case against one raw reply. */
export function grade(suite, kase, replyText) {
  const task = suite.tasks[kase.type];
  if (!task) throw new Error(`no grader for case type ${kase.type}`);
  const parsed = parseAnswer(suite, kase, replyText);
  if (parsed.error) return unparseable(kase, parsed);
  return {
    id: kase.id,
    type: kase.type,
    recovered: parsed.recovered,
    ...task.grade(kase, parsed.value),
  };
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
export function gradeRow(suite, kase, row) {
  return { ...gradeReply(suite, kase, row), ...toolUse(row) };
}

/**
 * How a with-tools row used its tools. Absent entirely on an unaided run, so
 * "made no calls" and "had no tools to call" never look the same.
 */
function toolUse(row) {
  if (!Array.isArray(row.toolCalls)) return {};
  return {
    toolCalls: row.toolCalls.length,
    toolErrors: row.toolCalls.filter((c) => c.isError).length,
  };
}

function gradeReply(suite, kase, row) {
  if (!row.error) return grade(suite, kase, row.text);
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
 * Tool use across a set of results, when the run had tools. The number that
 * matters most is the cases that *never* called one: a model that answers
 * from memory with a calculator sitting next to it is a finding in itself.
 */
function toolSummary(rows) {
  const withTools = rows.filter((r) => r.toolCalls !== undefined);
  if (withTools.length === 0) return {};
  return {
    tools: {
      casesUsingTools: withTools.filter((r) => r.toolCalls > 0).length,
      calls: withTools.reduce((a, r) => a + r.toolCalls, 0),
      failedCalls: withTools.reduce((a, r) => a + r.toolErrors, 0),
    },
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
    // An average of percentage points, dollars and frequency points is not
    // a number, so error figures exist only where every result shares a
    // unit. The overall block therefore has none - it once reported a
    // "worst error" of 500 percentage points that was a USD ICM miss.
    const units = new Set(scored.map((r) => r.unit));
    const errors = units.size === 1 ? scored.map((r) => r.error) : [];
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
      unit: units.size === 1 ? [...units][0] : null,
      ...toolSummary(rows),
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
