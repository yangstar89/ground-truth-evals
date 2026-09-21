import { describe, it, expect } from 'vitest';
import { buildPrompt, parseAnswer } from '../protocol.js';
import { grade, gradeRow, summarise, diffRuns } from './index.js';
import { RANGES, getFrequencies, getAction } from '../oracle/ranges.js';

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

describe('prompts', () => {
  it('states the output contract for every task type', () => {
    for (const kase of [equityCase, icmCase, rangeCase]) {
      const p = buildPrompt(kase);
      expect(p).toContain('exactly one JSON object');
      expect(p).toContain('Schema:');
    }
  });
  it('tells the model whether opponents are known', () => {
    expect(buildPrompt(equityCase)).toContain('known opponent hands: KcKd');
    expect(buildPrompt({ ...equityCase, opponents: [], numOpponents: 3 }))
      .toContain('3 opponent(s) with unknown hole cards');
  });
  it('says preflop rather than showing an empty board', () => {
    expect(buildPrompt({ ...equityCase, board: '' })).toContain('none (preflop)');
  });
  it('refuses to build a prompt for a type it does not know', () => {
    expect(() => buildPrompt({ type: 'bluff-frequency' })).toThrow(/no prompt/);
  });
});

describe('parsing a reply', () => {
  it('reads the contract being honoured', () => {
    const r = parseAnswer(equityCase, '{"equity_pct": 91.3}');
    expect(r.value).toBe(91.3);
    expect(r.recovered).toBe(false);
  });

  it('reads JSON out of a markdown fence, which models add unprompted', () => {
    const r = parseAnswer(equityCase, 'Sure!\n```json\n{"equity_pct": 91.3}\n```\n');
    expect(r.value).toBe(91.3);
    expect(r.recovered).toBe(false);
  });

  it('survives nested objects and braces inside strings', () => {
    const r = parseAnswer(equityCase, '{"note": "a {tricky} one", "equity_pct": 42.5}');
    expect(r.value).toBe(42.5);
  });

  it('falls back to prose, and says so', () => {
    const r = parseAnswer(equityCase, 'Hero has about 91.3% equity here.');
    expect(r.value).toBe(91.3);
    expect(r.recovered).toBe(true);
  });

  it('prefers the number wearing a percent sign', () => {
    const r = parseAnswer(equityCase, 'With 2 outs twice, hero sits at 24.5% equity.');
    expect(r.value).toBe(24.5);
  });

  it('accepts an icm array only at the right length', () => {
    expect(parseAnswer(icmCase, '{"icm": [412.5, 330, 257.5]}').value).toEqual([412.5, 330, 257.5]);
    expect(parseAnswer(icmCase, '{"icm": [412.5, 330]}').error).toBeTruthy();
    // Prose with the wrong count is refused rather than guessed at.
    expect(parseAnswer(icmCase, 'seats get 412.5, 330, 257.5 and 100').error).toBeTruthy();
  });

  it('normalises an action and rejects an invented one', () => {
    expect(parseAnswer(rangeCase, '{"action": "  RAISE "}').value).toBe('raise');
    expect(parseAnswer(rangeCase, '{"action": "shove"}').error).toBeTruthy();
    expect(parseAnswer(rangeCase, 'I would raise here.').value).toBe('raise');
  });

  it('reports failure rather than inventing a value', () => {
    expect(parseAnswer(equityCase, 'I cannot say.').error).toBeTruthy();
    expect(parseAnswer(rangeCase, 'It depends.').error).toBeTruthy();
    expect(parseAnswer(equityCase, '').error).toBeTruthy();
  });
});

describe('equity grader', () => {
  it('passes inside the tolerance and reports the distance', () => {
    const r = grade(equityCase, '{"equity_pct": 90.0}');
    expect(r.pass).toBe(true);
    expect(r.error).toBeCloseTo(1.28, 2);
    expect(r.unit).toBe('percentage points');
  });
  it('fails outside it, and the error shows how badly', () => {
    const near = grade(equityCase, '{"equity_pct": 85}');
    const wild = grade(equityCase, '{"equity_pct": 40}');
    expect(near.pass).toBe(false);
    expect(wild.pass).toBe(false);
    expect(wild.error).toBeGreaterThan(near.error);
  });
  it('marks an unreadable reply as failed and unparseable, not as wrong', () => {
    const r = grade(equityCase, 'no idea');
    expect(r.pass).toBe(false);
    expect(r.unparseable).toBe(true);
    expect(r.error).toBeNull();
  });
});

describe('icm grader', () => {
  it('scores on the worst seat, not the average', () => {
    // Two seats exact, one a long way out.
    const r = grade(icmCase, '{"icm": [412.5, 330.0, 200.0]}');
    expect(r.error).toBeCloseTo(57.5, 5);
    expect(r.detail).toContain('seat 3');
  });
  it('scales the tolerance to the prize pool', () => {
    // Pool is 1000, so the default bar is 20.
    expect(grade(icmCase, '{"icm": [412.5, 330.0, 240.0]}').pass).toBe(true);
    expect(grade(icmCase, '{"icm": [412.5, 330.0, 230.0]}').pass).toBe(false);
  });
});

describe('range grader', () => {
  it('matches a pure action', () => {
    expect(grade(rangeCase, '{"action": "raise"}').pass).toBe(true);
    expect(grade(rangeCase, '{"action": "fold"}').pass).toBe(false);
  });

  it('accepts either branch of a mixed strategy, and reports the frequency', () => {
    // Find a genuinely mixed hand in the vendored chart rather than assuming one.
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
      const r = grade(kase, JSON.stringify({ action }));
      expect(r.pass).toBe(true);
      expect(r.mixed).toBe(true);
      expect(r.frequency).toBeGreaterThan(0);
    }
    const never = ['raise', 'call', 'fold'].find((a) => !played.includes(a));
    if (never) expect(grade(kase, JSON.stringify({ action: never })).pass).toBe(false);
  });

  it('names the chart action it expected', () => {
    expect(grade(rangeCase, '{"action": "fold"}').expected).toBe(getAction(pureEntry));
  });
});

describe('summarise', () => {
  const results = [
    grade(equityCase, '{"equity_pct": 91.0}'),      // pass
    grade(equityCase, '{"equity_pct": 40}'),        // fail
    grade({ ...equityCase, id: 'eq-3' }, 'about 91.2% I think'),  // pass, recovered
    grade({ ...equityCase, id: 'eq-4' }, 'dunno'),  // unparseable
    grade(rangeCase, '{"action": "raise"}'),        // pass
  ];

  it('counts passes, recoveries and unreadable replies', () => {
    const s = summarise(results);
    expect(s.overall.n).toBe(5);
    expect(s.overall.passed).toBe(3);
    expect(s.overall.passRate).toBeCloseTo(0.6, 6);
    expect(s.overall.recovered).toBe(1);
    expect(s.overall.unparseable).toBe(1);
  });

  it('splits by type, because the types are not comparable', () => {
    const s = summarise(results);
    expect(s.byType.equity.n).toBe(4);
    expect(s.byType.range.n).toBe(1);
    expect(s.byType.range.passRate).toBe(1);
  });

  it('leaves the mean error alone when nothing could be scored', () => {
    const s = summarise([grade({ ...equityCase, id: 'x' }, 'dunno')]);
    expect(s.overall.meanError).toBeNull();
  });
});

describe('grading a run row that holds an error instead of a reply', () => {
  const truncated = { id: 'eq-1', text: '', error: 'reply truncated at the output cap of 16000 tokens', errorKind: 'truncated' };
  const noCredit = { id: 'eq-1', text: '', error: 'HTTP 429 from api.openai.com: insufficient_quota', errorKind: 'request' };

  it('grades a reply exactly as grade() does when there is no error', () => {
    const row = { id: 'eq-1', text: '{"equity_pct": 91.3}' };
    expect(gradeRow(equityCase, row)).toEqual(grade(equityCase, row.text));
  });

  it('fails a model that spent its whole budget, but not as an unreadable reply', () => {
    const r = gradeRow(equityCase, truncated);
    expect(r.pass).toBe(false);
    expect(r.truncated).toBe(true);
    expect(r.unparseable).toBeUndefined();
  });

  it('never presents a failed request as something the model said', () => {
    const r = gradeRow(equityCase, noCredit);
    expect(r.requestFailed).toBe(true);
    expect(r.unparseable).toBeUndefined();
    expect(r.detail).toMatch(/request failed/);
  });

  it('counts the three kinds of no-answer separately, so an empty account cannot pass as a 0% model', () => {
    const s = summarise([
      gradeRow(equityCase, truncated),
      gradeRow(equityCase, noCredit),
      gradeRow(equityCase, { id: 'eq-1', text: 'I would rather not say.' }),
    ]).overall;
    expect([s.truncated, s.requestFailed, s.unparseable]).toEqual([1, 1, 1]);
  });

  it('still recognises truncation in rows written before errorKind was recorded', () => {
    const { errorKind, ...old } = truncated;
    expect(gradeRow(equityCase, old).truncated).toBe(true);
    const { errorKind: _, ...oldRequest } = noCredit;
    expect(gradeRow(equityCase, oldRequest).requestFailed).toBe(true);
  });
});

describe('tool use in a run', () => {
  const answer = '{"equity_pct": 91.3}';

  it('says nothing about tools on an unaided run, so "no calls" never reads as "no tools"', () => {
    const s = summarise([gradeRow(equityCase, { id: 'eq-1', text: answer })]).overall;
    expect(s.tools).toBeUndefined();
  });

  it('counts the cases that never called a tool, and the calls that failed', () => {
    const s = summarise([
      gradeRow(equityCase, { id: 'eq-1', text: answer, toolCalls: [{ name: 'equity', isError: true }, { name: 'equity', isError: false }] }),
      gradeRow(equityCase, { id: 'eq-1', text: answer, toolCalls: [] }),
    ]).overall;
    expect(s.tools).toEqual({ casesUsingTools: 1, calls: 2, failedCalls: 1 });
  });
});

describe('diffRuns', () => {
  const baseline = [
    { id: 'a', type: 'equity', pass: true },
    { id: 'b', type: 'equity', pass: false },
    { id: 'c', type: 'range', pass: true },
    { id: 'gone', type: 'range', pass: true },
  ];
  const current = [
    { id: 'a', type: 'equity', pass: false, detail: 'broke' },
    { id: 'b', type: 'equity', pass: true, detail: 'fixed' },
    { id: 'c', type: 'range', pass: true, detail: 'same' },
    { id: 'new', type: 'range', pass: true, detail: 'added' },
  ];

  it('names what broke and what got fixed, not just the totals', () => {
    const d = diffRuns(baseline, current);
    expect(d.regressions.map((r) => r.id)).toEqual(['a']);
    expect(d.fixes.map((r) => r.id)).toEqual(['b']);
  });

  it('notices cases entering and leaving the set', () => {
    const d = diffRuns(baseline, current);
    expect(d.only_in_current).toEqual(['new']);
    expect(d.only_in_baseline).toEqual(['gone']);
  });
});
