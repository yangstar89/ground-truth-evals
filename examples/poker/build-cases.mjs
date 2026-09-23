#!/usr/bin/env node
/**
 * Writes the case files. Ground truth is computed here and frozen, so a score
 * today and a score next year mean the same thing.
 *
 *   node examples/poker/build-cases.mjs [dir]
 *
 * Two files, because mixing them would make the Hold'em numbers stop being
 * comparable with every committed baseline:
 *
 *   v1.jsonl        Hold'em: equity, ICM and preflop ranges
 *   variants.jsonl  Omaha (four, five and six cards), short deck, Omaha Hi-Lo
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EQUITY_SPECS, ICM_SPECS, RANGE_SPECS } from './cases/specs.js';
import { VARIANT_EQUITY_SPECS } from './cases/variant-specs.js';
import { buildEquityCases, buildIcmCases, buildRangeCases, auditCases } from './cases/build.js';

const dir = resolve(process.argv[2] ?? 'examples/poker/cases');

/** Write one case file, refusing to write at all if the set fails its audit. */
function write(cases, out) {
  const problems = auditCases(cases);
  if (problems.length) {
    console.error(`the case set failed its own audit (${out}):`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');

  const byType = {};
  const byMethod = {};
  for (const c of cases) {
    const key = c.variant ? `${c.type}:${c.variant}` : c.type;
    byType[key] = (byType[key] ?? 0) + 1;
    byMethod[c.method] = (byMethod[c.method] ?? 0) + 1;
  }
  console.log(`${cases.length} cases -> ${out}`);
  console.log('  by type:  ', Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('  by method:', Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`  exact: ${cases.filter((c) => c.exact).length}, sampled: ${cases.filter((c) => !c.exact).length}`);
}

const started = Date.now();

// The Hold'em set, unchanged: its ids and its frozen truth are what every
// committed baseline is measured against.
write([
  ...buildEquityCases(EQUITY_SPECS),
  ...buildIcmCases(ICM_SPECS),
  ...buildRangeCases(RANGE_SPECS),
], resolve(dir, 'v1.jsonl'));

// The variant set: Omaha, short deck and hi-lo.
write(buildEquityCases(VARIANT_EQUITY_SPECS, { idPrefix: 'veq' }), resolve(dir, 'variants.jsonl'));

console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
