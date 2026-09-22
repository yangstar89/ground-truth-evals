/**
 * Renders a run into something a person reads.
 *
 * Two rules shape this. Results are never blended across task types, because
 * equity arithmetic and chart recall are different skills and one percentage
 * would hide which one is broken. And failures are listed individually, because
 * the aggregate tells you whether to care and only the list tells you why.
 */

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const num = (x, dp = 2) => (x === null || x === undefined ? '-' : Number(x).toFixed(dp));

/**
 * One markdown table cell. A newline ends the row and a pipe starts a new
 * column, and failure details carry both: a failed request quotes the API's
 * error body, which OpenAI pretty-prints over several lines. Unescaped, one
 * such cell ends the table at that row.
 */
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

/** Group results by their spec tag, which is how the dataset says what a case is for. */
function byTag(results, cases) {
  const tagOf = new Map(cases.map((c) => [c.id, c.tag]));
  const groups = new Map();
  for (const r of results) {
    const tag = tagOf.get(r.id) ?? 'untagged';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(r);
  }
  return [...groups]
    .map(([tag, rows]) => ({
      tag,
      n: rows.length,
      passed: rows.filter((x) => x.pass).length,
      rate: rows.filter((x) => x.pass).length / rows.length,
    }))
    .sort((a, b) => a.rate - b.rate || a.tag.localeCompare(b.tag));
}

export function renderMarkdown({ meta, summary, results, cases, diff }) {
  const out = [];
  out.push(`# Eval run — ${meta.model}`);
  out.push('');
  out.push(table([{
    model: meta.model,
    temperature: meta.temperature === null ? 'n/a' : meta.temperature,
    cases: summary.overall.n,
    'pass rate': pct(summary.overall.passRate),
    'schema ignored': summary.overall.recovered,
    unreadable: summary.overall.unparseable,
    'out of budget': summary.overall.truncated,
    'request failed': summary.overall.requestFailed,
    'wall clock': `${(meta.durationMs / 1000).toFixed(1)}s`,
  }]));

  out.push('## By task');
  out.push('');
  out.push(table(Object.entries(summary.byType).map(([type, b]) => ({
    task: type,
    n: b.n,
    passed: b.passed,
    'pass rate': pct(b.passRate),
    'mean error': `${num(b.meanError)}${b.unit ? ' ' + b.unit : ''}`,
    'worst error': `${num(b.maxError)}${b.unit ? ' ' + b.unit : ''}`,
  }))));

  if (summary.overall.tools) {
    out.push('## Tool use');
    out.push('');
    if (meta.tools) out.push(`Tools from \`${meta.tools.command}\`: ${meta.tools.names.map((n) => `\`${n}\``).join(', ')}.`);
    out.push('A case that never called a tool was answered from the model\'s own');
    out.push('arithmetic, with the tools available and unused.');
    out.push('');
    out.push(table(Object.entries(summary.byType).map(([type, b]) => ({
      task: type,
      n: b.n,
      'used a tool': b.tools.casesUsingTools,
      'never called one': b.n - b.tools.casesUsingTools,
      calls: b.tools.calls,
      'failed calls': b.tools.failedCalls,
    }))));
  }

  out.push('## By kind of spot');
  out.push('');
  out.push('Weakest first. This is the column that says what the model does not know.');
  out.push('');
  out.push('Tags marked _thin_ carry fewer than three cases, so their rate is one or two');
  out.push('answers rather than a measurement - read them as a pointer to look, not as a');
  out.push('number to quote.');
  out.push('');
  out.push(table(byTag(results, cases).map((g) => ({
    tag: g.tag,
    n: g.n,
    passed: g.passed,
    'pass rate': pct(g.rate),
    note: g.n < 3 ? '_thin_' : '',
  }))));

  const failures = results.filter((r) => !r.pass);
  out.push(`## Failures (${failures.length})`);
  out.push('');
  out.push(table(failures.map((f) => ({
    id: f.id,
    task: f.type,
    detail: f.detail,
  }))));

  if (diff) {
    out.push('## Against baseline');
    out.push('');
    out.push(`Baseline: \`${diff.baselineName}\``);
    out.push('');
    out.push(`**Regressions (${diff.regressions.length})** — passed before, fail now:`);
    out.push('');
    out.push(table(diff.regressions.map((r) => ({ id: r.id, task: r.type, detail: r.detail }))));
    out.push(`**Fixes (${diff.fixes.length})**:`);
    out.push('');
    out.push(table(diff.fixes.map((r) => ({ id: r.id, task: r.type, detail: r.detail }))));
    if (diff.only_in_current.length || diff.only_in_baseline.length) {
      out.push(`Case set changed: ${diff.only_in_current.length} added, ${diff.only_in_baseline.length} removed.`);
      out.push('');
    }
  }

  return out.join('\n');
}

/** A one-line summary for a terminal. */
export function renderLine(meta, summary) {
  const parts = [
    `${meta.model}:`,
    `${summary.overall.passed}/${summary.overall.n} (${pct(summary.overall.passRate)})`,
  ];
  for (const [type, b] of Object.entries(summary.byType)) {
    parts.push(`${type} ${pct(b.passRate)}`);
  }
  if (summary.overall.recovered) parts.push(`schema ignored x${summary.overall.recovered}`);
  if (summary.overall.unparseable) parts.push(`unreadable x${summary.overall.unparseable}`);
  if (summary.overall.truncated) parts.push(`out of budget x${summary.overall.truncated}`);
  if (summary.overall.requestFailed) parts.push(`REQUEST FAILED x${summary.overall.requestFailed}`);
  const t = summary.overall.tools;
  if (t) parts.push(`tools used on ${t.casesUsingTools}/${summary.overall.n}, ${t.calls} calls, ${t.failedCalls} failed`);
  return parts.join('  ');
}
