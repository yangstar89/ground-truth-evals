/**
 * Turns the hand-written specs into cases with ground truth attached.
 *
 * Ground truth is computed once, here, and frozen into the case file. That is
 * deliberate: sampled equities depend on a seed and an iteration count, so
 * recomputing them at grading time would quietly move the target whenever those
 * defaults changed. A committed case file means a score from today and a score
 * from next year mean the same thing.
 */
import { equity, choose } from '../oracle/equity.js';
import { calculateICM } from '../oracle/icm.js';
import { RANGES, SCENARIO_LABELS, getAction, getFrequencies } from '../oracle/ranges.js';
import { variantFor } from '../oracle/variants.js';
import { parseCards } from '../oracle/hand.js';

/** Iterations for sampled spots. High enough that the noise is well inside the tolerance. */
export const SAMPLE_ITERATIONS = 200000;

/**
 * Iterations for a sampled spot in a variant. Lower than Hold'em because each
 * iteration scores up to a hundred and fifty combinations per player rather
 * than one; the sampling error is about 0.35pp at 20k, still well inside the
 * tolerance a model is judged by.
 */
export const VARIANT_SAMPLE_ITERATIONS = 20000;

/**
 * Tolerance for a sampled equity, in percentage points.
 *
 * Wider than for an enumerated spot, because the truth itself carries sampling
 * error of roughly 0.5 / sqrt(n) as a percentage - about 0.1pp at 200k. The
 * tolerance is what a model is allowed to be out by, so it has to cover both
 * that and a reasonable rounding of the answer.
 */
const TOLERANCE_SAMPLED = 2.5;
const TOLERANCE_EXACT = 2;

const pad = (n, width = 3) => String(n).padStart(width, '0');

/**
 * Equity cases. A spec may name a `variant`; Hold'em is the default and is
 * left off the case entirely, so the Hold'em file is exactly what it was
 * before the other games existed.
 *
 * Omaha scores sixty to a hundred and fifty five-card combinations per player
 * per board, so a sampled Omaha spot at the Hold'em iteration count would take
 * minutes for noise it does not need. The count is per variant, and the
 * tolerance follows from it.
 */
export function buildEquityCases(specs, { idPrefix = 'eq', startAt = 1 } = {}) {
  return specs.map((spec, i) => {
    const seed = 1000 + i;
    const variant = spec.variant ?? 'holdem';
    const iterations = variant === 'holdem' ? SAMPLE_ITERATIONS : VARIANT_SAMPLE_ITERATIONS;
    const r = equity({
      hero: spec.hero,
      board: spec.board ?? '',
      opponents: spec.opponents ?? [],
      numOpponents: spec.numOpponents ?? 0,
      seed,
      iterations,
      variant,
    });
    return {
      id: `${idPrefix}-${pad(i + startAt)}`,
      type: 'equity',
      tag: spec.tag,
      ...(spec.variant ? { variant: spec.variant } : {}),
      hero: spec.hero,
      board: spec.board ?? '',
      opponents: spec.opponents ?? [],
      numOpponents: spec.numOpponents ?? 0,
      expected: r.equity,
      tolerancePct: r.exact ? TOLERANCE_EXACT : TOLERANCE_SAMPLED,
      method: r.method,
      exact: r.exact,
      samples: r.samples,
      ...(r.exact ? {} : { seed }),
    };
  });
}

export function buildIcmCases(specs) {
  return specs.map((spec, i) => {
    const expected = calculateICM(spec.stacks, spec.payouts);
    const pool = spec.payouts.reduce((a, b) => a + b, 0);
    return {
      id: `icm-${pad(i + 1)}`,
      type: 'icm',
      tag: spec.tag,
      stacks: spec.stacks,
      payouts: spec.payouts,
      currency: 'USD',
      expected,
      // Two per cent of the prize pool: tight enough to catch a model that has
      // simply chip-chopped, loose enough to forgive rounding.
      tolerance: pool * 0.02,
      method: 'malmuth-harville',
      exact: true,
    };
  });
}

export function buildRangeCases(specs) {
  return specs.map((spec, i) => {
    const grid = RANGES[spec.position]?.[spec.scenario];
    if (!grid) throw new Error(`no chart for ${spec.position} ${spec.scenario}`);
    const entry = grid[spec.hand];
    if (entry === undefined) throw new Error(`no entry for ${spec.hand} in ${spec.position} ${spec.scenario}`);
    const freqs = getFrequencies(entry);
    return {
      id: `rg-${pad(i + 1)}`,
      type: 'range',
      tag: spec.tag,
      position: spec.position,
      scenario: spec.scenario,
      scenarioLabel: SCENARIO_LABELS[spec.scenario] ?? spec.scenario,
      hand: spec.hand,
      entry,
      expected: getAction(entry),
      frequencies: freqs,
      mixed: Object.values(freqs).filter((f) => f > 0).length > 1,
      method: 'chart',
      exact: true,
    };
  });
}

/** Sanity checks that would have caught a broken oracle before a model ever ran. */
export function auditCases(cases) {
  const problems = [];
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (c.type === 'equity') {
      if (!(c.expected >= 0 && c.expected <= 1)) problems.push(`${c.id}: equity ${c.expected} outside 0..1`);
      // "Exact" has to mean enumerated, and the number of boards walked has
      // to be the number that exist. Preflop is not the test: a short deck
      // preflop is only C(32,5) boards and enumerates honestly, where a
      // Hold'em one does not.
      if (c.exact !== (c.method === 'enumerate')) problems.push(`${c.id}: exact ${c.exact} but method ${c.method}`);
      // A hand of the wrong size for its game would have been computed as a
      // different spot, or not at all.
      const variant = variantFor(c.variant ?? 'holdem');
      const hands = [c.hero, ...(c.opponents ?? [])];
      for (const h of hands) {
        const n = parseCards(h).length;
        if (n !== variant.holeCards) problems.push(`${c.id}: ${h} has ${n} cards, ${variant.label} deals ${variant.holeCards}`);
      }
      const deck = new Set(variant.deck());
      const known = parseCards([c.hero, ...(c.opponents ?? []), c.board].filter(Boolean).join(' '));
      for (const card of known) {
        if (!deck.has(card)) problems.push(`${c.id}: ${card} is not in the ${variant.label} deck`);
      }
      if (c.exact && !c.numOpponents) {
        const toCome = 5 - parseCards(c.board || '').length;
        const boards = choose(deck.size - known.length, toCome);
        if (c.samples !== boards) problems.push(`${c.id}: walked ${c.samples} boards, ${boards} exist`);
      }
    }
    if (c.type === 'icm') {
      const pool = c.payouts.reduce((a, b) => a + b, 0);
      const sum = c.expected.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - pool) > 1e-6) problems.push(`${c.id}: icm sums to ${sum}, pool is ${pool}`);
      if (c.expected.length !== c.stacks.length) problems.push(`${c.id}: icm length mismatch`);
    }
    if (c.type === 'range') {
      const total = Object.values(c.frequencies).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 1e-6) problems.push(`${c.id}: frequencies total ${total}`);
    }
  }
  return problems;
}
