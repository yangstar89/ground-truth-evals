#!/usr/bin/env node
/**
 * Writes examples/dates/cases/v1.jsonl.
 *
 *   node examples/dates/build-cases.mjs [dir]
 *
 * The truth is computed here and frozen into the file, which is the rule the
 * harness relies on everywhere: a case answers for itself, so changing this
 * generator can never quietly move the target under a run that has already
 * been scored.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { daysBetween, weekdayOf } from './suite.js';

/** Spots chosen where the calendar is awkward, not where it is easy. */
const DAY_SPECS = [
  { tag: 'same-month', from: '2024-03-01', to: '2024-03-15' },
  { tag: 'across-month', from: '2024-01-28', to: '2024-02-03' },
  { tag: 'leap-day', from: '2024-02-28', to: '2024-03-01' },
  { tag: 'leap-day', from: '2023-02-28', to: '2023-03-01' },
  { tag: 'leap-year', from: '2024-01-01', to: '2025-01-01' },
  { tag: 'century-not-leap', from: '1900-02-28', to: '1900-03-01' },
  { tag: 'century-leap', from: '2000-02-28', to: '2000-03-01' },
  { tag: 'across-year', from: '2023-12-20', to: '2024-01-05' },
  { tag: 'backwards', from: '2024-06-01', to: '2024-05-20' },
  { tag: 'long-span', from: '1969-07-20', to: '2024-07-20' },
  { tag: 'long-span', from: '1900-01-01', to: '2000-01-01' },
  { tag: 'same-day', from: '2024-05-05', to: '2024-05-05' },
];

const WEEKDAY_SPECS = [
  { tag: 'recent', date: '2024-02-29' },
  { tag: 'recent', date: '2025-01-01' },
  { tag: 'recent', date: '2024-12-25' },
  { tag: 'historic', date: '1969-07-20' },
  { tag: 'historic', date: '1900-01-01' },
  { tag: 'historic', date: '1752-09-14' },
  { tag: 'far-future', date: '2100-03-01' },
  { tag: 'far-future', date: '2400-02-29' },
];

const pad = (n) => String(n).padStart(3, '0');
const cases = [
  ...DAY_SPECS.map((s, i) => ({
    id: `days-${pad(i + 1)}`,
    type: 'days',
    tag: s.tag,
    from: s.from,
    to: s.to,
    expected: daysBetween(s.from, s.to),
    method: 'calendar',
    exact: true,
  })),
  ...WEEKDAY_SPECS.map((s, i) => ({
    id: `day-${pad(i + 1)}`,
    type: 'day',
    tag: s.tag,
    date: s.date,
    expected: weekdayOf(s.date),
    method: 'calendar',
    exact: true,
  })),
];

// The same self-audit the poker set gets: a generator that writes a nonsense
// case is worth catching before a model is ever charged for answering it.
const problems = [];
const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`);
  ids.add(c.id);
  if (c.type === 'days' && !Number.isInteger(c.expected)) problems.push(`${c.id}: ${c.expected} is not a whole number of days`);
  if (c.type === 'day' && !c.expected) problems.push(`${c.id}: no weekday`);
}
if (problems.length) {
  console.error('the case set failed its own audit:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

const out = join(resolve(process.argv[2] ?? 'examples/dates/cases'), 'v1.jsonl');
mkdirSync(resolve(process.argv[2] ?? 'examples/dates/cases'), { recursive: true });
writeFileSync(out, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
console.log(`${cases.length} cases -> ${out}`);
