import { describe, it, expect } from 'vitest';
import { handClass, callTool } from './tools.js';

describe('reading a hand class', () => {
  it('accepts the same hand however a model spells it', () => {
    for (const s of ['AKs', 'aks', 'KAs', ' AKs ']) expect(handClass(s), s).toBe('AKs');
    expect(handClass('72o')).toBe('72o');
    expect(handClass('27o')).toBe('72o');
    expect(handClass('qq')).toBe('QQ');
  });

  it('refuses shapes that name no single class, rather than guessing one', () => {
    // Specific cards, a suited pair, and two ranks with no suitedness.
    for (const s of ['AcKd', 'AAs', 'AK', 'A5x', '', null]) expect(handClass(s), String(s)).toBeNull();
  });
});

describe('calling a tool by name', () => {
  it('names the tools that exist when asked for one that does not', () => {
    expect(callTool('equity', {}).error).toMatch(/poker_equity/);
  });

  it('rejects a misspelt argument instead of silently running without it', () => {
    // Dropped, "numOpponents" would mean no unknown opponents at all.
    const { error } = callTool('poker_equity', { hero: 'AcAd', numOpponents: 2 });
    expect(error).toMatch(/numOpponents/);
    expect(error).toMatch(/num_opponents/);
  });

  it('treats a missing arguments object as empty, and says what is required', () => {
    expect(callTool('poker_icm', undefined).error).toMatch(/stacks/);
  });
});
