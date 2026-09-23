/**
 * The poker suite: its prompts, its readers, and its three graders.
 *
 * The harness's own rules are tested in src/ against a throwaway domain. What
 * is checked here is only what poker knows: that a prompt says whether the
 * opponents are known, that equity is scored in percentage points, that ICM is
 * scored on the worst seat, and that a mixed chart entry accepts either branch.
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt, parseAnswer } from '../../src/protocol.js';
import { grade } from '../../src/graders/index.js';
import { createStubRunner } from '../../src/runners/stub.js';
import suite from './suite.js';
import { RANGES, getFrequencies, getAction } from './oracle/ranges.js';

const equityCase = {
  id: 'eq-1', type: 'equity', hero: 'AcAd', board: '2c 7d 9h',
  opponents: ['KcKd'], expected: 0.9128, tolerancePct: 2,
};
const icmCase = {
  id: 'icm-1', type: 'icm', stacks: [5000, 3000, 2000], payouts: [500, 300, 200],
  expected: [412.5, 330.0, 257.5], currency: 'USD',
};
/** A hand the chart plays as one pure action. */
const pureHand = 'AA';
const pureEntry = RANGES.BTN.RFI[pureHand];
const rangeCase = {
  id: 'rg-1', type: 'range', position: 'BTN', scenarioLabel: 'Raise First In',
  hand: pureHand, entry: pureEntry,
};

const prompt = (kase) => buildPrompt(suite, kase);
const parse = (kase, text) => parseAnswer(suite, kase, text);
const score = (kase, text) => grade(suite, kase, text);

describe('prompts', () => {
  it('states the output contract for every task type', () => {
    for (const kase of [equityCase, icmCase, rangeCase]) {
      const p = prompt(kase);
      expect(p).toContain('exactly one JSON object');
      expect(p).toContain('Schema:');
    }
  });
  it('tells the model whether opponents are known', () => {
    expect(prompt(equityCase)).toContain('known opponent hands: KcKd');
    expect(prompt({ ...equityCase, opponents: [], numOpponents: 3 }))
      .toContain('3 opponent(s) with unknown hole cards');
  });
  it('says preflop rather than showing an empty board', () => {
    expect(prompt({ ...equityCase, board: '' })).toContain('none (preflop)');
  });
  it('refuses to build a prompt for a type it does not know', () => {
    expect(() => prompt({ type: 'bluff-frequency' })).toThrow(/no task for case type/);
  });
});

describe('an equity reply under the bare "equity" key', () => {
  it('reads a 0-1 value as a fraction, so echoing the tool\'s own field is not scored 23 points out', () => {
    // poker_equity returns equity as a fraction beside equity_pct.
    const r = parse(equityCase, '{"equity": 0.9128}');
    expect(r.value).toBeCloseTo(91.28, 6);
    expect(score(equityCase, '{"equity": 0.9128}').pass).toBe(true);
  });

  it('reads a larger value as a percentage', () => {
    expect(parse(equityCase, '{"equity": 91.3}').value).toBe(91.3);
  });

  it('counts either as ignoring the schema, which asks for equity_pct', () => {
    expect(parse(equityCase, '{"equity": 0.9128}').recovered).toBe(true);
    expect(parse(equityCase, '{"equity_pct": 91.3}').recovered).toBe(false);
  });
});

describe('reading a poker reply', () => {
  it('prefers the number wearing a percent sign', () => {
    expect(parse(equityCase, 'With 2 outs twice, hero sits at 24.5% equity.').value).toBe(24.5);
  });

  it('accepts an icm array only at the right length', () => {
    expect(parse(icmCase, '{"icm": [412.5, 330, 257.5]}').value).toEqual([412.5, 330, 257.5]);
    expect(parse(icmCase, '{"icm": [412.5, 330]}').error).toBeTruthy();
    // Prose with the wrong count is refused rather than guessed at.
    expect(parse(icmCase, 'seats get 412.5, 330, 257.5 and 100').error).toBeTruthy();
  });

  it('normalises an action and rejects an invented one', () => {
    expect(parse(rangeCase, '{"action": "  RAISE "}').value).toBe('raise');
    expect(parse(rangeCase, '{"action": "shove"}').error).toBeTruthy();
    expect(parse(rangeCase, 'I would raise here.').value).toBe('raise');
  });

  it('reports failure rather than inventing a value', () => {
    expect(parse(equityCase, 'I cannot say.').error).toBeTruthy();
    expect(parse(rangeCase, 'It depends.').error).toBeTruthy();
    expect(parse(equityCase, '').error).toBeTruthy();
  });
});

describe('equity grader', () => {
  it('passes inside the tolerance and reports the distance', () => {
    const r = score(equityCase, '{"equity_pct": 90.0}');
    expect(r.pass).toBe(true);
    expect(r.error).toBeCloseTo(1.28, 2);
    expect(r.unit).toBe('percentage points');
  });
  it('fails outside it, and the error shows how badly', () => {
    const near = score(equityCase, '{"equity_pct": 85}');
    const wild = score(equityCase, '{"equity_pct": 40}');
    expect(near.pass).toBe(false);
    expect(wild.pass).toBe(false);
    expect(wild.error).toBeGreaterThan(near.error);
  });
  it('marks an unreadable reply as failed and unparseable, not as wrong', () => {
    const r = score(equityCase, 'no idea');
    expect(r.pass).toBe(false);
    expect(r.unparseable).toBe(true);
    expect(r.error).toBeNull();
  });
});

describe('icm grader', () => {
  it('scores on the worst seat, not the average', () => {
    // Two seats exact, one a long way out.
    const r = score(icmCase, '{"icm": [412.5, 330.0, 200.0]}');
    expect(r.error).toBeCloseTo(57.5, 5);
    expect(r.detail).toContain('seat 3');
  });
  it('scales the tolerance to the prize pool', () => {
    // Pool is 1000, so the default bar is 20.
    expect(score(icmCase, '{"icm": [412.5, 330.0, 240.0]}').pass).toBe(true);
    expect(score(icmCase, '{"icm": [412.5, 330.0, 230.0]}').pass).toBe(false);
  });
});

describe('range grader', () => {
  it('matches a pure action', () => {
    expect(score(rangeCase, '{"action": "raise"}').pass).toBe(true);
    expect(score(rangeCase, '{"action": "fold"}').pass).toBe(false);
  });

  it('accepts either branch of a mixed strategy, and reports the frequency', () => {
    // Find a genuinely mixed hand in the chart rather than assuming one.
    let mixedHand = null;
    for (const [pos, scenarios] of Object.entries(RANGES)) {
      for (const [scenario, grid] of Object.entries(scenarios)) {
        for (const [hand, entry] of Object.entries(grid)) {
          const f = getFrequencies(entry);
          if (Object.values(f).filter((v) => v > 0).length > 1) {
            mixedHand = { pos, scenario, hand, entry, freqs: f };
            break;
          }
        }
        if (mixedHand) break;
      }
      if (mixedHand) break;
    }
    if (!mixedHand) {
      // The chart is all pure actions: nothing to assert, and saying so beats
      // a test that silently passes for the wrong reason.
      expect(mixedHand).toBeNull();
      return;
    }
    const kase = {
      id: 'rg-mixed', type: 'range', position: mixedHand.pos,
      scenarioLabel: mixedHand.scenario, hand: mixedHand.hand, entry: mixedHand.entry,
    };
    const played = Object.entries(mixedHand.freqs).filter(([, v]) => v > 0).map(([k]) => k);
    for (const action of played) {
      const r = score(kase, JSON.stringify({ action }));
      expect(r.pass).toBe(true);
      expect(r.mixed).toBe(true);
      expect(r.frequency).toBeGreaterThan(0);
    }
    const never = ['raise', 'call', 'fold'].find((a) => !played.includes(a));
    if (never) expect(score(kase, JSON.stringify({ action: never })).pass).toBe(false);
  });

  it('names the chart action it expected', () => {
    expect(score(rangeCase, '{"action": "fold"}').expected).toBe(getAction(pureEntry));
  });
});

describe('the poker stub', () => {
  it('answers the same way twice for a seed, and differently for another', async () => {
    const a = createStubRunner(suite, { seed: 4 });
    const b = createStubRunner(suite, { seed: 4 });
    const c = createStubRunner(suite, { seed: 5 });
    expect((await a.complete(equityCase)).text).toBe((await b.complete(equityCase)).text);
    // Across a set of cases at least one answer must differ, or the seed does nothing.
    const cases = [equityCase, icmCase, rangeCase];
    const textsA = [];
    const textsC = [];
    for (const k of cases) {
      textsA.push((await a.complete(k)).text);
      textsC.push((await c.complete(k)).text);
    }
    expect(textsA.join('|')).not.toBe(textsC.join('|'));
  });

  it('produces replies the graders can actually read', async () => {
    const runner = createStubRunner(suite, { seed: 1, skill: 1 });
    for (const kase of [equityCase, icmCase, rangeCase]) {
      const { text } = await runner.complete(kase);
      expect(score(kase, text).unparseable).not.toBe(true);
    }
  });

  it('gets better as skill rises', async () => {
    const cases = Array.from({ length: 40 }, (_, i) => ({ ...equityCase, id: `eq-${i}` }));
    const rate = async (skill) => {
      const runner = createStubRunner(suite, { seed: 9, skill });
      let passed = 0;
      for (const k of cases) if (score(k, (await runner.complete(k)).text).pass) passed++;
      return passed / cases.length;
    };
    expect(await rate(0.95)).toBeGreaterThan(await rate(0.4));
  });

  it('chip-chops on ICM when it goes wrong, which is the mistake worth catching', async () => {
    // skill 0 forces the wrong branch every time.
    const runner = createStubRunner(suite, { seed: 2, skill: 0 });
    const kase = { ...icmCase, stacks: [8000, 1000, 1000], expected: [434.7, 282.6, 282.6] };
    const { text } = await runner.complete(kase);
    const said = JSON.parse(text).icm ?? [];
    // A chip chop of an 80% stack against a 1000 pool is 800, far above true ICM.
    expect(said[0]).toBeGreaterThan(700);
  });
});
