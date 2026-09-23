/**
 * Equity for the variants, checked against things that must be true rather
 * than numbers recalled from somewhere.
 *
 * Three kinds of check, and between them they pin the engine down:
 *
 *   conservation  every player's equity in a pot sums to exactly 1, whatever
 *                 the game. An evaluator that misreads one hand almost always
 *                 breaks this, because the error is not symmetric.
 *   decided spots a finished board with a hand that cannot be beaten is 100%,
 *                 and one that cannot win is 0% - both checkable by eye.
 *   the rules     a hand that is only strong if you break the rules of the
 *                 game must not be strong: the Omaha one-card flush, the
 *                 short-deck full house that loses to a flush.
 */
import { describe, it, expect } from 'vitest';
import { enumerateEquity, sampleEquity } from './equity.js';

/** Hero's equity, and each opponent's, by asking from every seat in turn. */
function allEquities(hands, board, variant) {
  return hands.map((_, i) => {
    const hero = hands[i];
    const opps = hands.filter((__, j) => j !== i);
    return enumerateEquity(hero, opps, board, { variant }).equity;
  });
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('equity sums to one, whatever the game', () => {
  const spots = [
    ['plo', ['AcAdKcKd', 'QhQsJhJs'], '2c 7d 9h'],
    ['plo5', ['AcAdKcKd5s', 'QhQsJhJs4d'], '2c 7d 9h'],
    ['plo6', ['AcAdKcKd5s6s', 'QhQsJhJs4d3d'], '2c 7d 9h'],
    ['shortdeck', ['AcAd', 'KhKs'], '6c 7d 9h'],
    ['omaha-hi-lo', ['AcAd2c3d', 'QhQsJhJs'], '2h 7d 9c'],
    ['holdem', ['AcAd', 'KhKs'], '2c 7d 9h'],
  ];

  for (const [variant, hands, board] of spots) {
    it(`${variant}, heads-up`, () => {
      expect(sum(allEquities(hands, board, variant))).toBeCloseTo(1, 9);
    });
  }

  it('three-way, where a chopped pot has to be split three ways to add up', () => {
    const hands = ['AcAdKcKd', 'QhQsJhJs', '8c8d9c9d'];
    expect(sum(allEquities(hands, '2c 7d 9h', 'plo'))).toBeCloseTo(1, 9);
  });

  it('three-way in hi-lo, where each half of the pot is split on its own', () => {
    const hands = ['AcAd2c3d', 'QhQsJhJs', '4c5d6c7d'];
    expect(sum(allEquities(hands, '2h 7s 9c', 'omaha-hi-lo'))).toBeCloseTo(1, 9);
  });
});

describe('spots that are already decided', () => {
  it('gives 100% to a hand that cannot be beaten on the river', () => {
    // Hero holds the nut flush using two hole cards; no board pair, so no
    // full house is possible for anyone.
    const r = enumerateEquity('AhKh2c3d', ['QsQd7s8d'], 'Jh 9h 4h 2s 5c', { variant: 'plo' });
    expect(r.equity).toBe(1);
    expect(r.exact).toBe(true);
  });

  it('gives 0% to the hand on the other side of it', () => {
    expect(enumerateEquity('QsQd7s8d', ['AhKh2c3d'], 'Jh 9h 4h 2s 5c', { variant: 'plo' }).equity).toBe(0);
  });

  it('splits a hi-lo pot in half when one player has the low and the other the high', () => {
    // Hero makes A-2-3-4-8 for the low and only a pair of eights for the
    // high; the opponent has three jacks and no low card at all. Note the
    // low cards must not also make a straight, or the same hand scoops.
    const r = enumerateEquity('Ac4d7s8c', ['JdJs9h9c'], '2h 3s 8d Jc Th', { variant: 'omaha-hi-lo' });
    expect(r.equity).toBeCloseTo(0.5, 9);
  });

  it('scoops when the same hand wins both halves', () => {
    const r = enumerateEquity('Ac2d3s4c', ['KhQd9h9s'], '5h 6s 7d Jc Th', { variant: 'omaha-hi-lo' });
    expect(r.equity).toBe(1);
  });
});

describe('the rules of the game decide the equity', () => {
  it("an Omaha hand with one card of the board's suit has no flush to win with", () => {
    // Four hearts on the river, hero holding one. Opponent has two of them,
    // so hero's ace of hearts is worthless and the pot is already lost.
    const r = enumerateEquity('Ah2c3d4s', ['Kh Qh 5c 6d'.replace(/ /g, '')], 'Jh 9h 7h 2h 3c', { variant: 'plo' });
    expect(r.equity).toBe(0);
  });

  it('a short-deck full house loses to a flush, where the same cards win in Hold\'em', () => {
    // Hero: nines full of eights. Opponent: the ace-high flush.
    const board = '9h 8h 8d Qh Jd';
    expect(enumerateEquity('9c9d', ['AhKh'], board, { variant: 'shortdeck' }).equity).toBe(0);
    expect(enumerateEquity('9c9d', ['AhKh'], board, { variant: 'holdem' }).equity).toBe(1);
  });

  it('refuses a card the short deck does not contain, rather than answering a different spot', () => {
    expect(() => enumerateEquity('2c3d', ['AhKh'], '', { variant: 'shortdeck' })).toThrow(/not in the/);
  });

  it('insists on the right number of hole cards for the game', () => {
    expect(() => enumerateEquity('AcAd', ['KhKs'], '2c 7d 9h', { variant: 'plo' })).toThrow(/exactly 4 cards/);
    expect(() => enumerateEquity('AcAdKcKd', ['KhKsQhQs'], '2c 7d 9h', { variant: 'plo5' })).toThrow(/exactly 5 cards/);
  });
});

describe('sampling the variants', () => {
  it('replays identically for a seed, and lands near the enumerated answer', () => {
    const spot = { opponents: ['QhQsJhJs'], board: '2c 7d 9h', variant: 'plo', iterations: 20000, seed: 11 };
    const a = sampleEquity('AcAdKcKd', spot);
    const b = sampleEquity('AcAdKcKd', spot);
    expect(a.equity).toBe(b.equity);
    const exact = enumerateEquity('AcAdKcKd', ['QhQsJhJs'], '2c 7d 9h', { variant: 'plo' }).equity;
    expect(Math.abs(a.equity - exact)).toBeLessThan(0.01);
  });

  it('deals unknown opponents the right number of cards for the game', () => {
    // Four unknown Omaha hands plus the board is 21 cards; the deck holds 52.
    const r = sampleEquity('AcAdKcKd', { numOpponents: 4, iterations: 2000, seed: 3, variant: 'plo' });
    expect(r.equity).toBeGreaterThan(0);
    expect(r.equity).toBeLessThan(1);
    expect(r.exact).toBe(false);
  });

  it('samples a short deck from 36 cards, so a preflop pair is worth less than in Hold\'em', () => {
    // Fewer cards means more connected boards; the point here is only that
    // the short deck is genuinely a different deck, not the exact figure.
    const short = sampleEquity('AcAd', { opponents: ['KhQh'], iterations: 20000, seed: 5, variant: 'shortdeck' }).equity;
    const full = sampleEquity('AcAd', { opponents: ['KhQh'], iterations: 20000, seed: 5, variant: 'holdem' }).equity;
    expect(short).toBeLessThan(full);
  });
});
