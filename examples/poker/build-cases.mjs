#!/usr/bin/env node
/**
 * Writes the case file. Ground truth is computed here and frozen, so a score
 * today and a score next year mean the same thing.
 *
 *   node examples/poker/build-cases.mjs [out]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EQUITY_SPECS, ICM_SPECS, RANGE_SPECS } from './cases/specs.js';
import { buildEquityCases, buildIcmCases, buildRangeCases, auditCases } from './cases/build.js';

const out = resolve(process.argv[2] ?? 'examples/poker/cases/v1.jsonl');

const started = Date.now();
const cases = [
  ...buildEquityCases(EQUITY_SPECS),
  ...buildIcmCases(ICM_SPECS),
  ...buildRangeCases(RANGE_SPECS),
];

const problems = auditCases(cases);
if (problems.length) {
  console.error('the case set failed its own audit:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');

const byType = {};
const byMethod = {};
for (const c of cases) {
  byType[c.type] = (byType[c.type] ?? 0) + 1;
  byMethod[c.method] = (byMethod[c.method] ?? 0) + 1;
}
console.log(`${cases.length} cases -> ${out}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log('  by type:  ', Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('  by method:', Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`  exact: ${cases.filter((c) => c.exact).length}, sampled: ${cases.filter((c) => !c.exact).length}`);
