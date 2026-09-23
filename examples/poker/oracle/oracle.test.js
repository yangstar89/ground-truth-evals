import { describe, it, expect } from 'vitest';
import { parseCards, scoreBest, scoreFive, categoryOf, CATEGORY } from './hand.js';
import { enumerateEquity, sampleEquity, equity, choose, rng } from './equity.js';
import { calculateICM } from './icm.js';

describe('parsing', () => {
  it('reads the three spellings of a hand', () => {
    expect(parseCards('AhKd')).toEqual(['Ah', 'Kd']);
    expect(parseCards('Ah Kd')).toEqual(['Ah', 'Kd']);
    expect(parseCards(['ah', 'kD'])).toEqual(['Ah', 'Kd']);
  });
  it('refuses anything it cannot read, rather than guessing', () => {
    expect(() => parseCards('Xh')).toThrow();
    expect(() => parseCards('Ah Ah')).toThrow(/duplicate/);
    expect(() => parseCards('A')).toThrow();
  });
});

describe('parsing a run of cards with a character left over', () => {
  it('refuses it, rather than dropping the stray character and scoring a different spot', () => {
    // Split into pairs, "AhKdQ" used to read as AhKd, and a stray character
    // on a board silently dropped a card and changed the street.
    expect(() => parseCards('AhKdQ')).toThrow(/AhKdQ/);
    expect(() => parseCards('2c7d9hJs4')).toThrow(/bad card/);
    expect(parseCards('2c7d9hJs4c')).toHaveLength(5);
  });
});

describe('hand ranking', () => {
  const better = (a, b) => scoreFive(parseCards(a)) > scoreFive(parseCards(b));

  it('orders the categories', () => {
    const ladder = [
      'AsKsQsJsTs', // straight flush
      'AcAdAhAs2c', // quads
      'AcAdAh2c2d', // full house
      'As9s7s4s2s', // flush
      'Ac2d3h4s5c', // straight (wheel)
      'AcAdAh7s2d', // trips
      'AcAd7h7s2d', // two pair
      'AcAd7h5s2d', // pair
      'AcKd7h5s2d', // high card
    ];
    for (let i = 0; i < ladder.length - 1; i++) {
      expect(better(ladder[i], ladder[i + 1])).toBe(true);
    }
  });

  it('names each category correctly', () => {
    const cases = [
      ['AsKsQsJsTs', CATEGORY.STRAIGHT_FLUSH],
      ['AcAdAhAs2c', CATEGORY.QUADS],
      ['AcAdAh2c2d', CATEGORY.FULL_HOUSE],
      ['As9s7s4s2s', CATEGORY.FLUSH],
      ['9c8d7h6s5c', CATEGORY.STRAIGHT],
      ['AcAdAh7s2d', CATEGORY.TRIPS],
      ['AcAd7h7s2d', CATEGORY.TWO_PAIR],
      ['AcAd7h5s2d', CATEGORY.PAIR],
      ['AcKd7h5s2d', CATEGORY.HIGH_CARD],
    ];
    for (const [hand, cat] of cases) {
      expect(categoryOf(scoreFive(parseCards(hand)))).toBe(cat);
    }
  });

  it('plays the ace low in a wheel, and ranks it below a six-high straight', () => {
    expect(scoreFive(parseCards('Ac2d3h4s5c'))).toBeLessThan(scoreFive(parseCards('2c3d4h5s6c')));
    expect(categoryOf(scoreFive(parseCards('Ac2d3h4s5c')))).toBe(CATEGORY.STRAIGHT);
  });

  it('does not read a wrapped A-K-Q-2-3 as a straight', () => {
    expect(categoryOf(scoreFive(parseCards('Ac2d3hKsQc')))).toBe(CATEGORY.HIGH_CARD);
  });

  it('breaks ties on kickers', () => {
    expect(better('AcAdKh5s2d', 'AcAdQh5s2d')).toBe(true);
    expect(better('AcAdKhQs2d', 'AcAdKhJs2d')).toBe(true);
    expect(better('AcAd7h7sKd', 'AcAd7h7sQd')).toBe(true);
  });

  it('finds the best five out of seven', () => {
    // A flush is available but a full house is better.
    expect(categoryOf(scoreBest(parseCards('AcAd Ah 2c 2d 9s 9h')))).toBe(CATEGORY.FULL_HOUSE);
    // The board alone is a straight; these hole cards cannot improve on it.
    const board = parseCards('5c6d7h8s9c');
    expect(scoreBest(parseCards('2c3d').concat(board))).toBe(scoreFive(board));
  });

  it('handles six cards as well as five and seven', () => {
    expect(categoryOf(scoreBest(parseCards('AcAdAh2c2d9s')))).toBe(CATEGORY.FULL_HOUSE);
  });
});

describe('choose', () => {
  it('counts boards the way the cap expects', () => {
    expect(choose(45, 2)).toBe(990);
    expect(choose(48, 5)).toBe(1712304);
    expect(choose(5, 0)).toBe(1);
    expect(choose(3, 5)).toBe(0);
  });
});

describe('enumerated equity', () => {
  it('is exact on a finished board and needs one showdown', () => {
    const r = enumerateEquity('AcAd', ['KcKd'], '2c 7d 9h Js 4c');
    expect(r.exact).toBe(true);
    expect(r.method).toBe('enumerate');
    expect(r.samples).toBe(1);
    expect(r.equity).toBe(1);
  });

  it('splits a chopped pot down the middle', () => {
    // Both players play the board: neither hole card improves on a made straight.
    const r = enumerateEquity('AcAd', ['KcKd'], '5h 6h 7s 8d 9c');
    expect(r.equity).toBeCloseTo(0.5, 10);
  });

  it('is symmetric: the two sides sum to one', () => {
    const a = enumerateEquity('AcAd', ['KcKd'], '2c 7d 9h');
    const b = enumerateEquity('KcKd', ['AcAd'], '2c 7d 9h');
    expect(a.equity + b.equity).toBeCloseTo(1, 10);
  });

  it('walks every board rather than a sample', () => {
    const r = enumerateEquity('AcAd', ['KcKd'], '2c 7d 9h');
    expect(r.samples).toBe(990);
  });

  it('refuses to enumerate a space bigger than the cap', () => {
    // Heads-up preflop is 1.7m boards: the caller is told to sample, not made
    // to wait, and never handed an estimate labelled exact.
    expect(() => enumerateEquity('AcAd', ['KcKd'])).toThrow(/exceeds the cap/);
  });

  it('rejects impossible inputs instead of returning a number', () => {
    expect(() => enumerateEquity('AcAd', ['AcKd'], '2c 7d 9h')).toThrow(/duplicate/);
    expect(() => enumerateEquity('AcAd', ['KcKd'], '2c 7d')).toThrow(/board/);
    expect(() => enumerateEquity('AcAdKh', ['KcKd'], '2c 7d 9h')).toThrow(/hero needs exactly 2 cards/);
  });
});

describe('sampled equity', () => {
  it('repeats exactly for a given seed, and differs for another', () => {
    const opts = { opponents: ['KcKd'], iterations: 4000 };
    const a = sampleEquity('AcAd', { ...opts, seed: 7 });
    const b = sampleEquity('AcAd', { ...opts, seed: 7 });
    const c = sampleEquity('AcAd', { ...opts, seed: 8 });
    expect(a.equity).toBe(b.equity);
    expect(a.equity).not.toBe(c.equity);
  });

  it('lands the famous preflop match-ups in their published ranges', () => {
    // Deliberately loose bounds: these catch an evaluator that is wrong, and
    // are not an attempt to pin a number from memory.
    const aaVsKk = sampleEquity('AcAd', { opponents: ['KcKd'], seed: 1, iterations: 40000 }).equity;
    expect(aaVsKk).toBeGreaterThan(0.79);
    expect(aaVsKk).toBeLessThan(0.86);

    const aaVs72 = sampleEquity('AcAd', { opponents: ['7h2s'], seed: 2, iterations: 40000 }).equity;
    expect(aaVs72).toBeGreaterThan(0.84);
    expect(aaVs72).toBeLessThan(0.91);

    const aksVsQq = sampleEquity('AsKs', { opponents: ['QcQd'], seed: 3, iterations: 40000 }).equity;
    expect(aksVsQq).toBeGreaterThan(0.43);
    expect(aksVsQq).toBeLessThan(0.50);
  });

  it('agrees with the enumerated answer where both can run', () => {
    const exact = enumerateEquity('AcAd', ['KcKd'], '2c 7d 9h').equity;
    const drawn = sampleEquity('AcAd', {
      opponents: ['KcKd'], board: '2c 7d 9h', seed: 4, iterations: 40000,
    }).equity;
    expect(Math.abs(exact - drawn)).toBeLessThan(0.01);
  });

  it('falls as opponents are added', () => {
    const one = sampleEquity('AcAd', { numOpponents: 1, seed: 5, iterations: 15000 }).equity;
    const five = sampleEquity('AcAd', { numOpponents: 5, seed: 5, iterations: 15000 }).equity;
    expect(one).toBeGreaterThan(five);
  });

  it('marks itself as an estimate, and records the seed it used', () => {
    const s = sampleEquity('AcAd', { numOpponents: 2, seed: 11, iterations: 500 });
    expect(s.exact).toBe(false);
    expect(s.method).toBe('sample');
    expect(s.seed).toBe(11);
  });
});

describe('equity(): picking a regime', () => {
  it('enumerates a flop against a known hand', () => {
    const r = equity({ hero: 'AcAd', opponents: ['KcKd'], board: '2c 7d 9h' });
    expect(r.method).toBe('enumerate');
    expect(r.exact).toBe(true);
  });
  it('samples preflop, where enumeration is out of reach', () => {
    const r = equity({ hero: 'AcAd', opponents: ['KcKd'], seed: 9, iterations: 2000 });
    expect(r.method).toBe('sample');
    expect(r.exact).toBe(false);
  });
  it('samples whenever an opponent is unknown', () => {
    const r = equity({ hero: 'AcAd', numOpponents: 3, board: '2c 7d 9h', seed: 9, iterations: 2000 });
    expect(r.method).toBe('sample');
  });
});

describe('rng', () => {
  it('stays inside the unit interval', () => {
    const next = rng(42);
    for (let i = 0; i < 5000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('icm', () => {
  it('pays out the whole prize pool', () => {
    const eq = calculateICM([5000, 3000, 2000], [500, 300, 200]);
    expect(eq.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6);
  });

  it('gives equal stacks equal equity', () => {
    const eq = calculateICM([1000, 1000, 1000], [500, 300, 200]);
    expect(eq[0]).toBeCloseTo(eq[1], 9);
    expect(eq[1]).toBeCloseTo(eq[2], 9);
  });

  it('is worth less to the leader than a straight chip chop, which is the point of ICM', () => {
    const stacks = [8000, 1000, 1000];
    const payouts = [500, 300, 200];
    const eq = calculateICM(stacks, payouts);
    const chipChop = (stacks[0] / 10000) * 1000;
    expect(eq[0]).toBeLessThan(chipChop);
  });

  it('handles an empty table without dividing by zero', () => {
    expect(calculateICM([0, 0], [100, 50])).toEqual([0, 0]);
  });
});
