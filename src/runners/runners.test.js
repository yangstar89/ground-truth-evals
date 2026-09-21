import { describe, it, expect } from 'vitest';
import { createStubRunner } from './stub.js';
import { createRunner } from './index.js';
import { mapLimit } from './http.js';
import { renderMarkdown, renderLine } from '../report.js';
import { grade, summarise } from '../graders/index.js';
import { RANGES } from '../oracle/ranges.js';

const equityCase = {
  id: 'eq-001', type: 'equity', tag: 'premium-vs-premium', hero: 'AcAd',
  board: '', opponents: ['KcKd'], numOpponents: 0, expected: 0.8261, tolerancePct: 2.5,
};
const icmCase = {
  id: 'icm-001', type: 'icm', tag: 'even-three', stacks: [3000, 3000, 3000],
  payouts: [500, 300, 200], currency: 'USD', expected: [333.33, 333.33, 333.33], tolerance: 20,
};
const rangeCase = {
  id: 'rg-001', type: 'range', tag: 'premium', position: 'UTG', scenario: 'RFI',
  scenarioLabel: 'Raise First In', hand: 'AA', entry: RANGES.UTG.RFI.AA,
};

describe('stub runner', () => {
  it('needs no credentials', () => {
    expect(() => createRunner('stub')).not.toThrow();
  });

  it('answers the same way twice for a seed, and differently for another', async () => {
    const a = createStubRunner({ seed: 4 });
    const b = createStubRunner({ seed: 4 });
    const c = createStubRunner({ seed: 5 });
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
    const runner = createStubRunner({ seed: 1, skill: 1 });
    for (const kase of [equityCase, icmCase, rangeCase]) {
      const { text } = await runner.complete(kase);
      expect(grade(kase, text).unparseable).not.toBe(true);
    }
  });

  it('gets better as skill rises', async () => {
    const cases = Array.from({ length: 40 }, (_, i) => ({ ...equityCase, id: `eq-${i}` }));
    const rate = async (skill) => {
      const runner = createStubRunner({ seed: 9, skill });
      const results = [];
      for (const k of cases) results.push(grade(k, (await runner.complete(k)).text));
      return summarise(results).overall.passRate;
    };
    expect(await rate(0.95)).toBeGreaterThan(await rate(0.4));
  });

  it('chip-chops on ICM when it goes wrong, which is the mistake worth catching', async () => {
    // skill 0 forces the wrong branch every time.
    const runner = createStubRunner({ seed: 2, skill: 0 });
    const kase = { ...icmCase, stacks: [8000, 1000, 1000], expected: [434.7, 282.6, 282.6] };
    const { text } = await runner.complete(kase);
    const said = JSON.parse(text).icm ?? [];
    // A chip chop of an 80% stack against a 1000 pool is 800, far above true ICM.
    expect(said[0]).toBeGreaterThan(700);
  });
});

describe('createRunner', () => {
  it('rejects a provider it does not know', () => {
    expect(() => createRunner('mistral:large')).toThrow(/unknown runner/);
  });

  it('refuses to build an api runner with no key, rather than calling without one', () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createRunner('openai:gpt-4o-mini')).toThrow(/OPENAI_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});

describe('mapLimit', () => {
  it('keeps input order regardless of completion order', async () => {
    const items = [30, 5, 20, 1, 10];
    const out = await mapLimit(items, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual(items);
  });

  it('never exceeds the limit', async () => {
    let live = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('copes with an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe('report', () => {
  const cases = [equityCase, icmCase, rangeCase];
  const results = [
    grade(equityCase, '{"equity_pct": 82.6}'),
    grade(icmCase, '{"icm": [333.3, 333.3, 333.3]}'),
    grade(rangeCase, '{"action": "fold"}'),
  ];
  const summary = summarise(results);
  const meta = { model: 'stub(test)', temperature: 0, durationMs: 1234 };

  it('renders every section, and never blends the task types', () => {
    const md = renderMarkdown({ meta, summary, results, cases });
    expect(md).toContain('# Eval run — stub(test)');
    expect(md).toContain('## By task');
    expect(md).toContain('## By kind of spot');
    expect(md).toContain('## Failures (1)');
    expect(md).toContain('| equity |');
    expect(md).toContain('| icm |');
    expect(md).toContain('| range |');
  });

  it('marks thin tags, so a one-case rate is not read as a measurement', () => {
    expect(renderMarkdown({ meta, summary, results, cases })).toContain('_thin_');
  });

  it('shows the failing case with its reason', () => {
    const md = renderMarkdown({ meta, summary, results, cases });
    expect(md).toContain('rg-001');
    expect(md).toContain('chart says raise');
  });

  it('includes a baseline section only when there is a baseline', () => {
    expect(renderMarkdown({ meta, summary, results, cases })).not.toContain('## Against baseline');
    const withDiff = renderMarkdown({
      meta, summary, results, cases,
      diff: {
        baselineName: 'b.json',
        regressions: [{ id: 'eq-001', type: 'equity', detail: 'broke' }],
        fixes: [], only_in_current: [], only_in_baseline: [],
      },
    });
    expect(withDiff).toContain('## Against baseline');
    expect(withDiff).toContain('**Regressions (1)**');
  });

  it('summarises to one line for a terminal', () => {
    const line = renderLine(meta, summary);
    expect(line).toContain('stub(test)');
    expect(line).toContain('2/3');
  });
});
