import { describe, it, expect } from 'vitest';
import { normaliseUsage, sumUsage, priceRun, formatTokens } from './usage.js';

describe('reading usage from whichever provider answered', () => {
  it('reads both providers\' field names as the same two numbers', () => {
    expect(normaliseUsage({ prompt_tokens: 100, completion_tokens: 20 })).toEqual({ input: 100, output: 20 });
    expect(normaliseUsage({ input_tokens: 100, output_tokens: 20 })).toEqual({ input: 100, output: 20 });
  });

  it('counts cached input as input, so a with-tools run is not flattered', () => {
    // The tool definitions go out on every call; cached or not, they were sent.
    const u = normaliseUsage({ input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 20 });
    expect(u).toEqual({ input: 1000, output: 20 });
  });

  it('treats a missing or unrecognised usage object as nothing, not as NaN', () => {
    expect(normaliseUsage(null)).toEqual({ input: 0, output: 0 });
    expect(normaliseUsage({ something_else: 5 })).toEqual({ input: 0, output: 0 });
  });
});

describe('totalling a run', () => {
  it('adds up the rows that reported usage and counts them', () => {
    const rows = [
      { usage: { prompt_tokens: 10, completion_tokens: 1 } },
      { usage: { prompt_tokens: 20, completion_tokens: 2 } },
      { error: 'request failed' },
    ];
    expect(sumUsage(rows)).toEqual({ input: 30, output: 3, replies: 2 });
  });
});

describe('pricing a run', () => {
  const prices = { 'openai:gpt-4o-mini': { input: 0.15, output: 0.6 } };

  it('charges input and output at their own rates, per million tokens', () => {
    const cost = priceRun({ input: 1e6, output: 1e6 }, prices, 'openai:gpt-4o-mini');
    expect(cost).toBeCloseTo(0.75, 10);
  });

  it('prices a with-tools run from the same model entry', () => {
    expect(priceRun({ input: 1e6, output: 0 }, prices, 'openai:gpt-4o-mini+tools')).toBeCloseTo(0.15, 10);
  });

  it('returns null for a model with no price, so a gap never reads as free', () => {
    expect(priceRun({ input: 1e6, output: 1e6 }, prices, 'anthropic:claude-sonnet-5')).toBeNull();
    expect(priceRun({ input: 1, output: 1 }, null, 'openai:gpt-4o-mini')).toBeNull();
  });
});

describe('formatting token counts', () => {
  it('keeps them readable at a glance', () => {
    expect(formatTokens(820)).toBe('820');
    expect(formatTokens(154998)).toBe('155k');
    expect(formatTokens(1_200_000)).toBe('1.2M');
  });
});
