#!/usr/bin/env node
/**
 * Build the measurements document from committed baselines.
 *
 *   node bin/compare.mjs --baselines examples/poker/baselines --cases examples/poker/cases --out docs/results.md
 *   node bin/compare.mjs --prices prices.json    # adds a cost column
 *
 * Tokens are always reported; money only when a price list is given, because
 * prices change and a committed document that quietly goes stale about what a
 * run cost is worse than one that says nothing.
 *
 * Every number in the output is read from a baseline file. Nothing is
 * recomputed and nothing is typed in, so the document cannot drift away from
 * the runs it describes - re-running this after a new run is the only way to
 * change it.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { renderScoreTable, renderBreakdown, renderCaseTable, hardestCases, runLabel } from '../src/compare.js';

function parseArgs(argv) {
  const args = {
    baselines: 'examples/poker/baselines',
    cases: 'examples/poker/cases',
    out: 'docs/results.md',
    title: 'Measurements',
  };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; } else args[key] = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const prices = args.prices ? readJson(resolve(args.prices)) : null;
const readCases = (p) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const baselines = readdirSync(resolve(args.baselines))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, ...readJson(join(resolve(args.baselines), f)) }))
  // The stub is a pipeline test, not a model, and putting it in a results
  // table would invite someone to read it as one.
  .filter((b) => !b.meta.model.startsWith('stub'));

if (baselines.length === 0) {
  console.error(`no model baselines in ${args.baselines}`);
  process.exit(1);
}

/** One section per case set, with the runs that were scored against it. */
const sets = new Map();
for (const b of baselines) {
  const file = b.meta.cases;
  if (!file) {
    console.error(`${b.file} does not say which cases it graded; re-save it with --regrade`);
    process.exit(1);
  }
  if (!sets.has(file)) sets.set(file, []);
  sets.get(file).push(b);
}

const order = (b) => `${b.meta.model.replace(/\+tools$/, '')}|${b.meta.tools ? 1 : 0}`;
const out = [];
out.push(`# ${args.title}`);
out.push('');
out.push('Generated from the baselines in `' + args.baselines + '` by `node bin/compare.mjs`.');
out.push('Every figure here is read from a committed baseline file, so this document');
out.push('and the runs it describes cannot disagree. What the numbers mean is');
out.push('argued in the README; this file is the evidence behind it.');
out.push('');
out.push('Token totals marked \* leave out replies that errored: those runs were made');
out.push('before the harness recorded the tokens a cut-off reply had already burned,');
out.push('and the figure is understated by exactly its most expensive cases.');
if (prices) {
  out.push('');
  out.push(`Costs use the rates in \`${basename(resolve(args.prices))}\`, in dollars per million tokens.`);
}
out.push('');

for (const [caseFile, runs] of [...sets].sort()) {
  const casePath = join(resolve(args.cases), caseFile);
  if (!existsSync(casePath)) {
    console.error(`cases file ${casePath} is missing, but ${runs[0].file} was graded against it`);
    process.exit(1);
  }
  const cases = readCases(casePath);
  runs.sort((a, b) => order(a).localeCompare(order(b)));

  // Repeats of one condition share a label, and two columns with the same
  // name would collapse into one. Naming them by their baseline file keeps
  // both visible and says which is which - "run 2" would only say which was
  // listed second, which is not a fact about the runs.
  const counts = new Map();
  for (const b of runs) counts.set(runLabel(b), (counts.get(runLabel(b)) ?? 0) + 1);
  for (const b of runs) {
    if (counts.get(runLabel(b)) > 1) b.label = `${runLabel(b)} [${b.file.replace(/\.json$/, '')}]`;
  }

  const variants = new Set(cases.map((c) => c.variant).filter(Boolean));
  out.push(`## ${caseFile} — ${cases.length} cases`);
  out.push('');
  const models = [...new Set(runs.map((r) => r.meta.model.replace(/\+tools$/, '')))];
  out.push(`${runs.length} runs, ${models.length} model${models.length === 1 ? '' : 's'}: ${models.join(', ')}.`);
  out.push('');

  out.push('### By task');
  out.push('');
  out.push(renderScoreTable(runs, cases, 'type', { prices }));

  if (variants.size) {
    out.push('### By game');
    out.push('');
    out.push(renderBreakdown(runs, cases, (k) => k.variant ?? 'holdem', { groupHeader: 'game' }));
  }

  out.push('### By kind of spot');
  out.push('');
  out.push('Weakest first, by the run that did worst on it. A tag with one or two');
  out.push('cases is a pointer to look, not a measurement.');
  out.push('');
  out.push(renderBreakdown(runs, cases, 'tag', { groupHeader: 'kind of spot' }));

  const hardest = hardestCases(runs, cases);
  out.push(`### Cases no run passed (${hardest.length})`);
  out.push('');
  if (hardest.length === 0) {
    out.push('_none: every case was passed by at least one run._');
    out.push('');
  } else {
    out.push(renderCaseTable(runs, hardest));
  }

  out.push('### Every case');
  out.push('');
  out.push('What each run answered, against the truth. The tables above are these');
  out.push('rows counted.');
  out.push('');
  out.push(renderCaseTable(runs, cases));

  out.push('### How these runs were made');
  out.push('');
  out.push(renderRunMeta(runs));
}

function renderRunMeta(runs) {
  const rows = runs.map((b) => ({
    run: runLabel(b),
    model: b.meta.model.replace(/\+tools$/, ''),
    temperature: b.meta.temperature === null ? 'default' : b.meta.temperature,
    prompt: b.meta.promptVersion,
    tools: b.meta.tools ? `\`${b.meta.tools.command}\`` : '-',
    baseline: `\`${b.file}\``,
  }));
  const head = Object.keys(rows[0]);
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map((r) => line(head.map((h) => String(r[h]))))].join('\n') + '\n';
}

const outPath = resolve(args.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out.join('\n'));
console.log(`${baselines.length} baselines across ${sets.size} case sets -> ${basename(outPath)}`);
