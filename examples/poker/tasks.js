/**
 * The three poker tasks: what each one asks, how a reply is read, and how it
 * is scored.
 *
 * This is everything the harness does not know. Each task is a prompt, two
 * readers (the JSON the schema asks for, and prose when the model ignores the
 * schema) and a grader that returns how far from the truth the answer was, in
 * that task's own units.
 */
import { CONTRACT, NUMBER } from '../../src/protocol.js';
import { numeric, worstOf, choice } from '../../src/graders/score.js';
import { getAction, getFrequencies } from './oracle/ranges.js';
import { variantFor } from './oracle/variants.js';

/** Equity, in percentage points of absolute error. */
const equity = {
  prompt(kase) {
    const variant = variantFor(kase.variant ?? 'holdem');
    const board = kase.board && kase.board.length ? kase.board : 'none (preflop)';
    const opp = kase.opponents && kase.opponents.length
      ? `known opponent hands: ${kase.opponents.join(', ')}`
      : `${kase.numOpponents} opponent(s) with unknown hole cards`;
    const holdem = variant.id === 'holdem';
    return [
      `You are computing ${variant.label} equity.`,
      // The rules of the variant are stated rather than assumed: the question
      // is whether the model can compute the equity, not whether it recalls
      // that Omaha makes you play exactly two hole cards. The Hold'em prompt
      // is left exactly as it was, so its committed baselines stay comparable.
      ...(holdem ? [] : [variant.rules]),
      '',
      `Hero hole cards: ${kase.hero}`,
      `Board: ${board}`,
      opp,
      '',
      'Give hero\'s equity: the share of the pot hero wins on average, counting',
      `a split pot as a ${holdem ? 'half' : 'share'}. Express it as a percentage from 0 to 100.`,
      '',
      CONTRACT,
      'Schema: {"equity_pct": <number>}',
    ].join('\n');
  },
  fromObject(kase, obj) {
    const n = obj.equity_pct ?? obj.equityPct;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  },
  /**
   * A bare `equity` key, which the schema does not ask for and whose unit is
   * ambiguous. The poker_equity tool returns `equity` as a 0-1 fraction beside
   * `equity_pct`, so a model echoing the tool's field sends 0.239 for 23.9% -
   * and reading that as a percentage would fail a correct answer by 23.7
   * points. A value in [0, 1] is taken as a fraction, anything larger as a
   * percentage. The one case this misreads is a sub-1% answer given as a
   * percentage under the wrong key, and that reply is already off-contract
   * and reported as such.
   */
  fromOffSchemaObject(kase, obj) {
    const n = obj.equity;
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return n >= 0 && n <= 1 ? n * 100 : n;
  },
  fromProse(kase, raw) {
    // Prefer a number attached to a percent sign, which is almost always the
    // answer rather than a stray count of outs.
    const pct = raw.match(new RegExp(`(${NUMBER.source})\\s*%`));
    if (pct) return Number(pct[1]);
    const any = raw.match(NUMBER);
    return any ? Number(any[0]) : undefined;
  },
  grade(kase, got) {
    const expected = kase.expected * 100;
    const tolerance = kase.tolerancePct ?? 2;
    const r = numeric({ got, expected, tolerance, unit: 'percentage points', dp: 1 });
    return { ...r, detail: `said ${got.toFixed(1)}%, truth ${expected.toFixed(1)}% (${r.error.toFixed(1)}pp out, tolerance ${tolerance})` };
  },
};

/** ICM, by the largest absolute error across seats. */
const icm = {
  prompt(kase) {
    return [
      'You are computing ICM equity for a poker tournament using the',
      'Malmuth-Harville model.',
      '',
      `Chip stacks, in seat order: ${kase.stacks.join(', ')}`,
      `Payouts, first place first: ${kase.payouts.join(', ')}`,
      '',
      'Give each seat\'s ICM equity in the same currency as the payouts, in the',
      'same seat order as the stacks.',
      '',
      CONTRACT,
      `Schema: {"icm": [<number> x ${kase.stacks.length}]}`,
    ].join('\n');
  },
  fromObject(kase, obj) {
    const a = obj.icm ?? obj.equities ?? obj.values;
    if (!Array.isArray(a) || a.length !== kase.stacks.length) return undefined;
    return a.every((n) => typeof n === 'number' && Number.isFinite(n)) ? a : undefined;
  },
  fromProse(kase, raw) {
    const all = raw.match(new RegExp(NUMBER.source, 'g')) ?? [];
    const nums = all.map(Number).filter((n) => Number.isFinite(n));
    // Only trust prose here when the count matches exactly: picking the "right"
    // subset of a longer list would be guessing.
    return nums.length === kase.stacks.length ? nums : undefined;
  },
  grade(kase, got) {
    // A tolerance proportional to the prize pool: an absolute one would be
    // trivially easy on a big pool and impossible on a small one.
    const pool = kase.payouts.reduce((a, b) => a + b, 0);
    const tolerance = kase.tolerance ?? pool * 0.02;
    return worstOf({
      got,
      expected: kase.expected,
      tolerance,
      unit: kase.currency ?? 'chips',
      elementName: 'seat',
    });
  },
};

/**
 * Preflop action, against the chart.
 *
 * Mixed strategies are the interesting case: where the chart raises a hand 60%
 * and folds it 40%, both answers are defensible, so anything the chart plays
 * with a non-zero frequency passes - and the frequency is reported, so a model
 * that always picks the 5% branch is still visible in the numbers.
 */
const range = {
  prompt(kase) {
    return [
      'You are playing a 100 big blind six-max cash game with standard',
      'solver-approximate preflop ranges.',
      '',
      `Position: ${kase.position}`,
      `Situation: ${kase.scenarioLabel}`,
      `Your hand: ${kase.hand}`,
      '',
      'Choose the action this hand takes in that spot.',
      '',
      CONTRACT,
      'Schema: {"action": "raise" | "call" | "fold"}',
    ].join('\n');
  },
  fromObject(kase, obj) {
    const s = obj.action ?? obj.decision;
    if (typeof s !== 'string') return undefined;
    const norm = s.trim().toLowerCase();
    return ['raise', 'call', 'fold'].includes(norm) ? norm : undefined;
  },
  fromProse(kase, raw) {
    const m = raw.toLowerCase().match(/\b(raise|call|fold)\b/);
    return m ? m[1] : undefined;
  },
  grade(kase, got) {
    return choice({
      got,
      weights: getFrequencies(kase.entry),
      describe: ({ primary, weight, mixed, weights }) =>
        mixed
          ? `said ${got}, chart plays it ${weight}% of the time (most frequent: ${primary} at ${weights[primary]}%)`
          : `said ${got}, chart says ${primary}`,
    });
  },
};

export const tasks = { equity, icm, range };

/**
 * How the fake model answers, when the harness's dice say right or wrong.
 * The wrong answers imitate how models actually fail: rounded, or confidently
 * off, or - on ICM - chip-chopped, which is exactly the mistake the ICM task
 * exists to catch, and exactly the one gpt-4o-mini made.
 */
export function stub(kase, { draw: d, wildlyWrong }) {
  if (kase.type === 'equity') {
    const truth = kase.expected * 100;
    const jitter = (d('jitter') - 0.5) * 2.4;
    const value = wildlyWrong
      ? Math.max(0, Math.min(100, truth + (d('bigmiss') > 0.5 ? 1 : -1) * (12 + d('size') * 30)))
      : truth + jitter;
    const rounded = Math.round(value * 10) / 10;
    return { json: { equity_pct: rounded }, prose: `Hero is around ${rounded}% here.` };
  }

  if (kase.type === 'icm') {
    const pool = kase.payouts.reduce((a, b) => a + b, 0);
    const chips = kase.stacks.reduce((a, b) => a + b, 0);
    // The classic error: treat chips as money.
    const chipChop = kase.stacks.map((s) => (s / chips) * pool);
    const source = wildlyWrong ? chipChop : kase.expected;
    const values = source.map((v) => Math.round(v * 10) / 10);
    return { json: { icm: values }, prose: `Roughly ${values.join(', ')} in seat order.` };
  }

  if (kase.type === 'range') {
    const freqs = getFrequencies(kase.entry);
    const best = getAction(kase.entry);
    const others = ['raise', 'call', 'fold'].filter((a) => a !== best);
    const action = wildlyWrong ? others[Math.floor(d('pick') * others.length)] : best;
    // On a mixed hand, sometimes take the minority branch: still correct,
    // and it exercises the frequency reporting.
    const mixed = Object.values(freqs).filter((f) => f > 0).length > 1;
    const chosen = !wildlyWrong && mixed && d('minority') > 0.6
      ? Object.entries(freqs).filter(([, f]) => f > 0).sort((a, b) => a[1] - b[1])[0][0]
      : action;
    return { json: { action: chosen }, prose: `I would ${chosen}.` };
  }

  return null;
}
