/**
 * Comparing runs. The rules worth pinning down are the ones that decide
 * whether a published table can mislead: a run is labelled by what it was,
 * a case that no run passed is found rather than averaged away, and every
 * headline number is the case rows counted.
 */
import { describe, it, expect } from 'vitest';
import { grade, summarise } from './graders/index.js';
import { demoSuite } from './fixtures/demo-suite.js';
import { renderScoreTable, renderBreakdown, renderCaseTable, hardestCases, runLabel } from './compare.js';

const cases = [
  { id: 'sum-1', type: 'sum', tag: 'easy', a: 2, b: 3, expected: 5, tolerance: 0.5 },
  { id: 'sum-2', type: 'sum', tag: 'hard', a: 21, b: 34, expected: 55, tolerance: 0.5 },
  { id: 'split-1', type: 'split', tag: 'easy', total: 100, ways: 3, expected: [40, 35, 25], tolerance: 2 },
];

/** A run of the fixture suite, from what each case was answered with. */
function run(meta, replies) {
  const results = cases.map((k) => grade(demoSuite, k, replies[k.id]));
  return { file: `${meta.model}.json`, meta, summary: summarise(results), results };
}

const unaided = run({ model: 'model-a', temperature: 0, promptVersion: 'v1', cases: 'demo.jsonl' }, {
  'sum-1': '{"total": 5}',
  'sum-2': '{"total": 99}',
  'split-1': '{"shares": [40, 35, 25]}',
});
const withTools = run({ model: 'model-a+tools', temperature: 0, promptVersion: 'v1', cases: 'demo.jsonl', tools: { command: 'node server.mjs', names: ['add'] } }, {
  'sum-1': '{"total": 5}',
  'sum-2': '{"total": 55}',
  'split-1': '{"shares": [90, 5, 5]}',
});

describe('labelling a run', () => {
  it('says which model, and whether it had tools, without the +tools suffix twice', () => {
    expect(runLabel(unaided)).toBe('model-a, unaided');
    expect(runLabel(withTools)).toBe('model-a, with tools');
  });
});

describe('the score table', () => {
  const md = renderScoreTable([unaided, withTools], cases, 'type');

  it('gives a column per task and the total in passes out of cases, not a bare rate', () => {
    expect(md).toContain('| run | sum | split | all |');
    expect(md).toContain('| model-a, unaided | 1/2 | 1/1 | **2/3** |');
    expect(md).toContain('| model-a, with tools | 2/2 | 0/1 | **2/3** |');
  });

  it('reports tool calls only for the run that had tools', () => {
    const rows = md.split('\n');
    expect(rows.find((r) => r.startsWith('| model-a, unaided'))).toMatch(/\| - \|$/);
  });
});

describe('the breakdown', () => {
  it('puts groups in rows and runs in columns, weakest group first', () => {
    const md = renderBreakdown([unaided, withTools], cases, 'tag', { groupHeader: 'kind' });
    const rows = md.split('\n').filter((r) => r.startsWith('| '));
    // Sorted by the run that did worst on the group: "hard" has a run at 0/1,
    // "easy" nothing below 1/2, so "hard" comes first however well the other
    // run did on it.
    expect(rows[2]).toContain('| hard |');
    expect(rows[3]).toContain('| easy |');
  });

  it('marks a group too small to read as a measurement', () => {
    expect(renderBreakdown([unaided], cases, 'tag', { groupHeader: 'kind' })).toContain('_thin_');
  });
});

describe('the case table', () => {
  const md = renderCaseTable([unaided, withTools], cases);

  it('shows what each run answered against the truth, marked pass or fail', () => {
    expect(md).toContain('| sum-2 | sum | hard | 55.0 | ✗ 99.0 | ✓ 55.0 |');
  });

  it('shows a vector answer element by element', () => {
    expect(md).toContain('40.0 / 35.0 / 25.0');
  });

  it('names a non-answer for what it was, rather than showing it as a wrong value', () => {
    const budget = { ...unaided, results: [{ id: 'sum-1', type: 'sum', pass: false, truncated: true }] };
    expect(renderCaseTable([budget], [cases[0]])).toContain('no answer (budget)');
  });
});

describe('cases no run passed', () => {
  it('finds the ones every run failed, which an average would bury', () => {
    expect(hardestCases([unaided, withTools], cases).map((c) => c.id)).toEqual([]);
    const bothWrong = run({ model: 'model-b', cases: 'demo.jsonl' }, {
      'sum-1': '{"total": 0}', 'sum-2': '{"total": 0}', 'split-1': '{"shares": [0, 0, 0]}',
    });
    expect(hardestCases([bothWrong, withTools], cases).map((c) => c.id)).toEqual(['split-1']);
  });
});
