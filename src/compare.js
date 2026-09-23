/**
 * Several graded runs, side by side.
 *
 * A single run's report answers "how did this model do". This answers the
 * question the harness exists for: what changed between two conditions - a
 * different model, or the same model with tools - and which cases moved.
 *
 * Everything here reads committed baselines. Nothing is recomputed and nothing
 * is typed in by hand, so a published table cannot drift away from the run it
 * claims to describe.
 */

import { formatTokens, priceRun } from './usage.js';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const cell = (v) => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').replace(/\|/g, '\\|');

function table(rows) {
  if (rows.length === 0) return '_none_\n';
  const head = Object.keys(rows[0]);
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [
    line(head.map(cell)),
    line(head.map(() => '---')),
    ...rows.map((r) => line(head.map((h) => cell(r[h])))),
  ].join('\n') + '\n';
}

/** "12/36", with the passes and the total kept visible rather than a bare rate. */
const score = (rows) => `${rows.filter((r) => r.pass).length}/${rows.length}`;

/**
 * Group a run's results by some property of the case, so a table can be broken
 * down by task type, by variant, or by tag without the caller repeating itself.
 */
function groupBy(results, cases, key) {
  const of = new Map(cases.map((c) => [c.id, c]));
  const groups = new Map();
  for (const r of results) {
    const kase = of.get(r.id);
    if (!kase) continue;
    const k = typeof key === 'function' ? key(kase) : kase[key];
    if (k === undefined) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

/**
 * The column each run gets: the model, and whether it had tools. A caller that
 * has two runs of the same condition - a repeat, to size the noise - sets
 * `label` itself, since two columns with one name would silently become one.
 */
export function runLabel(baseline) {
  if (baseline.label) return baseline.label;
  const model = baseline.meta.model.replace(/\+tools$/, '');
  return `${model}, ${baseline.meta.tools ? 'with tools' : 'unaided'}`;
}

/**
 * One table per case set: a row per run, a column per group, and the columns
 * that say how a run failed rather than only how often.
 */
export function renderScoreTable(baselines, cases, key, { prices = null } = {}) {
  const columns = [...new Set(baselines.flatMap((b) => [...groupBy(b.results, cases, key).keys()]))];
  return table(baselines.map((b) => {
    const groups = groupBy(b.results, cases, key);
    const row = { run: runLabel(b) };
    for (const c of columns) row[c] = groups.has(c) ? score(groups.get(c)) : '-';
    const o = b.summary.overall;
    row.all = `**${o.passed}/${o.n}**`;
    row['no answer'] = o.truncated + o.unparseable;
    row['tool calls'] = o.tools ? `${o.tools.calls} (${o.tools.failedCalls} failed)` : '-';
    // A run whose usage covers fewer replies than it has cases is missing the
    // tokens some replies spent, so the total is marked rather than presented
    // as if it were complete.
    const partial = b.meta.usage && b.meta.usage.replies < o.n;
    row.tokens = b.meta.usage
      ? `${formatTokens(b.meta.usage.input)} / ${formatTokens(b.meta.usage.output)}${partial ? ' \*' : ''}`
      : '-';
    if (prices) {
      const cost = priceRun(b.meta.usage, prices, b.meta.model);
      row.cost = cost === null ? '-' : `$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`;
    }
    return row;
  }));
}

/**
 * The same breakdown the other way up: one row per group, one column per run.
 *
 * With forty tags the wide form is unreadable, and the tall form sorts, so the
 * kinds of spot every model struggles with come to the top - which is the
 * question a breakdown by tag is asked in the first place.
 */
export function renderBreakdown(baselines, cases, key, { groupHeader = 'group' } = {}) {
  const groups = baselines.map((b) => groupBy(b.results, cases, key));
  const names = [...new Set(groups.flatMap((g) => [...g.keys()]))];
  const rate = (rows) => (rows.length ? rows.filter((r) => r.pass).length / rows.length : 0);
  const rows = names.map((name) => {
    const perRun = groups.map((g) => g.get(name) ?? []);
    const n = Math.max(...perRun.map((r) => r.length));
    const row = { [groupHeader]: name, cases: n };
    baselines.forEach((b, i) => { row[runLabel(b)] = perRun[i].length ? score(perRun[i]) : '-'; });
    row.note = n < 3 ? '_thin_' : '';
    return { row, worst: Math.min(...perRun.map(rate)), name };
  });
  rows.sort((a, b) => a.worst - b.worst || a.name.localeCompare(b.name));
  return table(rows.map((r) => r.row));
}

/**
 * What each run said, case by case, against the truth.
 *
 * This is the part a reader can check: every headline number above is just
 * these rows counted, and a case that every model gets wrong is visible here
 * even when the averages look healthy.
 */
export function renderCaseTable(baselines, cases) {
  const shown = (r) => {
    if (r.requestFailed) return 'request failed';
    if (r.truncated) return 'no answer (budget)';
    if (r.unparseable) return 'unreadable';
    if (Array.isArray(r.got)) return r.got.map((n) => Number(n).toFixed(1)).join(' / ');
    return typeof r.got === 'number' ? r.got.toFixed(1) : String(r.got ?? '-');
  };
  const truth = (kase, r) => {
    if (Array.isArray(r?.expected)) return r.expected.map((n) => Number(n).toFixed(1)).join(' / ');
    if (typeof r?.expected === 'number') return r.expected.toFixed(1);
    return String(r?.expected ?? '-');
  };
  const byRun = baselines.map((b) => new Map(b.results.map((r) => [r.id, r])));
  return table(cases.map((kase) => {
    // A run that never answered carries no truth, so the truth is read from
    // the first run that did. Taking the first result of any kind blanks the
    // column on exactly the cases where every model struggled.
    const any = byRun.map((m) => m.get(kase.id)).find((r) => r && r.expected !== undefined)
      ?? byRun.map((m) => m.get(kase.id)).find(Boolean);
    const row = {
      case: kase.id,
      kind: kase.variant ? `${kase.type} (${kase.variant})` : kase.type,
      tag: kase.tag ?? '',
      truth: truth(kase, any),
    };
    baselines.forEach((b, i) => {
      const r = byRun[i].get(kase.id);
      row[runLabel(b)] = r ? `${r.pass ? '✓' : '✗'} ${shown(r)}` : '-';
    });
    return row;
  }));
}

/** Cases no run passed: where the models agree, and usually where the work is. */
export function hardestCases(baselines, cases) {
  const failedEverywhere = cases.filter((kase) =>
    baselines.every((b) => {
      const r = b.results.find((x) => x.id === kase.id);
      return r && !r.pass;
    }));
  return failedEverywhere;
}

export { table, pct, score, groupBy };
