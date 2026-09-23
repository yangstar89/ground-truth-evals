/**
 * The harness's grading rules, tested against a throwaway domain rather than
 * poker: if any of this needed to know what an equity is, the split between
 * harness and suite would be a fiction.
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt, parseAnswer } from '../protocol.js';
import { grade, gradeRow, summarise, diffRuns } from './index.js';
import { numeric, worstOf, choice } from './score.js';
import { demoSuite, sumCase, splitCase } from '../fixtures/demo-suite.js';

describe('prompts', () => {
  it('asks every task for the same output contract', () => {
    for (const kase of [sumCase, splitCase]) {
      const p = buildPrompt(demoSuite, kase);
      expect(p).toContain('exactly one JSON object');
      expect(p).toContain('Schema:');
    }
  });

  it('refuses a case type the suite has no task for, and says what it has', () => {
    expect(() => buildPrompt(demoSuite, { type: 'product' })).toThrow(/sum, split/);
  });
});

describe('parsing a reply', () => {
  it('reads the contract being honoured', () => {
    const r = parseAnswer(demoSuite, sumCase, '{"total": 5}');
    expect(r.value).toBe(5);
    expect(r.recovered).toBe(false);
  });

  it('reads JSON out of a markdown fence, which models add unprompted', () => {
    const r = parseAnswer(demoSuite, sumCase, 'Sure!\n```json\n{"total": 5}\n```\n');
    expect(r.value).toBe(5);
    expect(r.recovered).toBe(false);
  });

  it('survives nested objects and braces inside strings', () => {
    expect(parseAnswer(demoSuite, sumCase, '{"note": "a {tricky} one", "total": 42.5}').value).toBe(42.5);
  });

  it('falls back to prose, and says so', () => {
    const r = parseAnswer(demoSuite, sumCase, 'It comes to about 5.');
    expect(r.value).toBe(5);
    expect(r.recovered).toBe(true);
  });

  it('refuses an array of the wrong length rather than guessing at it', () => {
    expect(parseAnswer(demoSuite, splitCase, '{"shares": [40, 35, 25]}').value).toEqual([40, 35, 25]);
    expect(parseAnswer(demoSuite, splitCase, '{"shares": [40, 35]}').error).toBeTruthy();
  });

  it('reports failure rather than inventing a value', () => {
    expect(parseAnswer(demoSuite, sumCase, 'I cannot say.').error).toBeTruthy();
    expect(parseAnswer(demoSuite, sumCase, '').error).toBeTruthy();
    // This task has no prose reader at all, so prose is simply unreadable.
    expect(parseAnswer(demoSuite, splitCase, 'about 40, 35 and 25').error).toBeTruthy();
  });
});

describe('the scoring shapes a suite builds graders from', () => {
  it('numeric passes inside the tolerance and reports the distance', () => {
    const r = numeric({ got: 4.8, expected: 5, tolerance: 0.5, unit: 'points' });
    expect([r.pass, r.unit]).toEqual([true, 'points']);
    expect(r.error).toBeCloseTo(0.2, 6);
    expect(numeric({ got: 9, expected: 5, tolerance: 0.5, unit: 'points' }).pass).toBe(false);
  });

  it('worstOf scores the worst element, not the average, and names it', () => {
    const r = worstOf({ got: [40, 35, 5], expected: [40, 35, 25], tolerance: 2, unit: 'USD', elementName: 'share' });
    expect(r.error).toBeCloseTo(20, 6);
    expect(r.detail).toContain('share 3');
    expect(r.pass).toBe(false);
  });

  it('worstOf refuses a vector of the wrong length instead of passing it', () => {
    // A missing element compares as NaN, which is never greater than the
    // running worst - so a short vector used to score pass with error 0.
    const short = worstOf({ got: [40, 35], expected: [40, 35, 25], tolerance: 2, unit: 'USD' });
    expect([short.pass, short.error]).toEqual([false, null]);
    expect(short.detail).toMatch(/expected 3 values, got 2/);
    expect(worstOf({ got: 'forty', expected: [40], tolerance: 2, unit: 'USD' }).pass).toBe(false);
  });

  it('choice accepts any option the truth plays, and reports how often it does', () => {
    const weights = { red: 70, blue: 30, green: 0 };
    expect(choice({ got: 'red', weights }).pass).toBe(true);
    const minority = choice({ got: 'blue', weights });
    expect(minority.pass).toBe(true);
    expect(minority.frequency).toBe(30);
    // Distance from the most-frequent option, so a 5% branch is still visible.
    expect(minority.error).toBe(40);
    expect(choice({ got: 'green', weights }).pass).toBe(false);
  });
});

describe('grading a reply', () => {
  it('marks an unreadable reply as failed and unparseable, not as wrong', () => {
    const r = grade(demoSuite, sumCase, 'no idea');
    expect([r.pass, r.unparseable, r.error]).toEqual([false, true, null]);
  });

  it('carries the case id and type onto the result', () => {
    const r = grade(demoSuite, sumCase, '{"total": 5}');
    expect([r.id, r.type, r.pass]).toEqual(['sum-1', 'sum', true]);
  });
});

describe('summarise', () => {
  const results = [
    grade(demoSuite, sumCase, '{"total": 5}'),                              // pass
    grade(demoSuite, sumCase, '{"total": 40}'),                             // fail
    grade(demoSuite, { ...sumCase, id: 'sum-3' }, 'about 5 I think'),       // pass, recovered
    grade(demoSuite, { ...sumCase, id: 'sum-4' }, 'dunno'),                 // unparseable
    grade(demoSuite, splitCase, '{"shares": [40, 35, 25]}'),                // pass
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
    expect(s.byType.sum.n).toBe(4);
    expect(s.byType.split.n).toBe(1);
    expect(s.byType.split.passRate).toBe(1);
  });

  it('leaves the mean error alone when nothing could be scored', () => {
    expect(summarise([grade(demoSuite, { ...sumCase, id: 'x' }, 'dunno')]).overall.meanError).toBeNull();
  });

  it('gives no error figures for a mix of units, rather than averaging points with dollars', () => {
    const s = summarise([
      grade(demoSuite, sumCase, '{"total": 40}'),
      grade(demoSuite, splitCase, '{"shares": [90, 5, 5]}'),
    ]);
    expect([s.overall.meanError, s.overall.maxError, s.overall.unit]).toEqual([null, null, null]);
    // Per task, where one unit holds, they are still reported.
    expect(s.byType.sum.unit).toBe('points');
    expect(s.byType.split.maxError).toBeGreaterThan(20);
  });
});

describe('grading a run row that holds an error instead of a reply', () => {
  const truncated = { id: 'sum-1', text: '', error: 'reply truncated at the output cap of 16000 tokens', errorKind: 'truncated' };
  const noCredit = { id: 'sum-1', text: '', error: 'HTTP 429 from api.openai.com: insufficient_quota', errorKind: 'request' };

  it('grades a reply exactly as grade() does when there is no error', () => {
    const row = { id: 'sum-1', text: '{"total": 5}' };
    expect(gradeRow(demoSuite, sumCase, row)).toEqual(grade(demoSuite, sumCase, row.text));
  });

  it('fails a model that spent its whole budget, but not as an unreadable reply', () => {
    const r = gradeRow(demoSuite, sumCase, truncated);
    expect(r.pass).toBe(false);
    expect(r.truncated).toBe(true);
    expect(r.unparseable).toBeUndefined();
  });

  it('never presents a failed request as something the model said', () => {
    const r = gradeRow(demoSuite, sumCase, noCredit);
    expect(r.requestFailed).toBe(true);
    expect(r.unparseable).toBeUndefined();
    expect(r.detail).toMatch(/request failed/);
  });

  it('counts the three kinds of no-answer separately, so an empty account cannot pass as a 0% model', () => {
    const s = summarise([
      gradeRow(demoSuite, sumCase, truncated),
      gradeRow(demoSuite, sumCase, noCredit),
      gradeRow(demoSuite, sumCase, { id: 'sum-1', text: 'I would rather not say.' }),
    ]).overall;
    expect([s.truncated, s.requestFailed, s.unparseable]).toEqual([1, 1, 1]);
  });

  it('still recognises truncation in rows written before errorKind was recorded', () => {
    const { errorKind, ...old } = truncated;
    expect(gradeRow(demoSuite, sumCase, old).truncated).toBe(true);
    const { errorKind: _, ...oldRequest } = noCredit;
    expect(gradeRow(demoSuite, sumCase, oldRequest).requestFailed).toBe(true);
  });
});

describe('tool use in a run', () => {
  const answer = '{"total": 5}';

  it('says nothing about tools on an unaided run, so "no calls" never reads as "no tools"', () => {
    const s = summarise([gradeRow(demoSuite, sumCase, { id: 'sum-1', text: answer })]).overall;
    expect(s.tools).toBeUndefined();
  });

  it('counts the cases that never called a tool, and the calls that failed', () => {
    const s = summarise([
      gradeRow(demoSuite, sumCase, { id: 'sum-1', text: answer, toolCalls: [{ name: 'add', isError: true }, { name: 'add', isError: false }] }),
      gradeRow(demoSuite, sumCase, { id: 'sum-1', text: answer, toolCalls: [] }),
    ]).overall;
    expect(s.tools).toEqual({ casesUsingTools: 1, calls: 2, failedCalls: 1 });
  });
});

describe('diffRuns', () => {
  const baseline = [
    { id: 'a', type: 'sum', pass: true },
    { id: 'b', type: 'sum', pass: false },
    { id: 'c', type: 'split', pass: true },
    { id: 'gone', type: 'split', pass: true },
  ];
  const current = [
    { id: 'a', type: 'sum', pass: false, detail: 'broke' },
    { id: 'b', type: 'sum', pass: true, detail: 'fixed' },
    { id: 'c', type: 'split', pass: true, detail: 'same' },
    { id: 'new', type: 'split', pass: true, detail: 'added' },
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
