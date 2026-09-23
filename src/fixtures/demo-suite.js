/**
 * A throwaway domain for the harness's own tests.
 *
 * It exists so that nothing under src/ has to import poker to be tested. It is
 * also the shortest honest answer to "what does a suite have to provide?" -
 * two task types, about forty lines, and the harness runs it exactly as it
 * runs the poker one.
 *
 * Two task types rather than one, because several harness rules only show up
 * where a run mixes them: per-type reporting, and the refusal to average an
 * error in points with an error in dollars.
 */
import { numeric, worstOf } from '../graders/score.js';

export const sumCase = { id: 'sum-1', type: 'sum', a: 2, b: 3, expected: 5, tolerance: 0.5 };
export const splitCase = { id: 'split-1', type: 'split', total: 100, ways: 3, expected: [40, 35, 25], tolerance: 2 };

export const demoSuite = {
  name: 'demo',
  systemPrompt: 'You are a calculator. Follow the output schema exactly.',
  unreadableReply: 'I would rather not say.',
  tasks: {
    sum: {
      prompt: (k) => `What is ${k.a} + ${k.b}?\nSchema: {"total": <number>}, exactly one JSON object.`,
      fromObject: (k, o) => (typeof o.total === 'number' && Number.isFinite(o.total) ? o.total : undefined),
      fromProse: (k, text) => {
        const m = text.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : undefined;
      },
      grade: (k, got) => numeric({ got, expected: k.expected, tolerance: k.tolerance, unit: 'points' }),
    },
    split: {
      prompt: (k) => `Split ${k.total} between ${k.ways}.\nSchema: {"shares": [<number>]}, exactly one JSON object.`,
      fromObject: (k, o) => (Array.isArray(o.shares) && o.shares.length === k.expected.length ? o.shares : undefined),
      grade: (k, got) => worstOf({ got, expected: k.expected, tolerance: k.tolerance, unit: 'USD', elementName: 'share' }),
    },
  },
  stub(kase, { wildlyWrong }) {
    if (kase.type === 'sum') {
      const value = wildlyWrong ? kase.expected + 10 : kase.expected;
      return { json: { total: value }, prose: `It is about ${value}.` };
    }
    if (kase.type === 'split') {
      const shares = wildlyWrong ? kase.expected.map(() => kase.total / kase.ways) : kase.expected;
      return { json: { shares }, prose: `Roughly ${shares.join(', ')}.` };
    }
    return null;
  },
};
