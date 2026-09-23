/**
 * The rules that make each variant different from Hold'em, as tests.
 *
 * Every assertion here is a rule of the game rather than a number remembered
 * from somewhere: that four board hearts and one in hand is not an Omaha
 * flush, that a short-deck flush beats a full house, that a low needs five
 * distinct ranks of eight or lower. If the evaluator disagrees with any of
 * them it is wrong, whatever its equities look like.
 */
import { describe, it, expect } from 'vitest';
import { packCards, parseCards, categoryOf, CATEGORY, scoreFive } from './hand.js';
import { scoreOmahaHigh, scoreOmahaLow, scoreFivePackedShort, variantFor, VARIANTS } from './variants.js';

const hole = (s) => packCards(parseCards(s));
const board = (s) => packCards(parseCards(s));
const five = (s) => {
  const p = packCards(parseCards(s));
  return scoreFivePackedShort(p[0], p[1], p[2], p[3], p[4]);
};
const shortCategory = (s) => Math.floor(five(s) / 16 ** 5);

describe('Omaha: exactly two from the hand, exactly three from the board', () => {
  it('does not make a flush from four board cards and one in hand', () => {
    // In Hold'em this hand is a flush; in Omaha it is only ace-high.
    const h = hole('Ah 2c 3c 4c');
    const b = board('Kh Qh 7h 2h 9s');
    expect(categoryOf(scoreOmahaHigh(h, b))).not.toBe(CATEGORY.FLUSH);
    // The same cards as a Hold'em hand do make the flush, which is the point.
    expect(categoryOf(scoreFive(parseCards('Ah Kh Qh 7h 2h')))).toBe(CATEGORY.FLUSH);
  });

  it('makes a flush when two of the suit are in the hand', () => {
    expect(categoryOf(scoreOmahaHigh(hole('Ah Jh 3c 4c'), board('Kh Qh 7h 2s 9d')))).toBe(CATEGORY.FLUSH);
  });

  it('cannot play the board, even when the board holds four aces', () => {
    // In Hold'em this hand is four aces with a king. In Omaha two hole cards
    // must play, so the best is three aces with a king and a seven.
    const h = hole('Kd 7s 2h 3c');
    const b = board('Ah As Ad Ac Kh');
    expect(categoryOf(scoreOmahaHigh(h, b))).toBe(CATEGORY.TRIPS);
    expect(categoryOf(scoreFive(parseCards('Ah As Ad Ac Kh')))).toBe(CATEGORY.QUADS);
  });

  it('makes quads from a pair in hand and a pair on the board', () => {
    expect(categoryOf(scoreOmahaHigh(hole('Ac Ad 7s 2h'), board('Ah As Kd Qc 9h')))).toBe(CATEGORY.QUADS);
  });

  it('reads five- and six-card hands the same way', () => {
    const b = board('Kh Qh 7h 2s 9d');
    expect(categoryOf(scoreOmahaHigh(hole('Ah Jh 3c 4c 5d'), b))).toBe(CATEGORY.FLUSH);
    expect(categoryOf(scoreOmahaHigh(hole('Ah Jh 3c 4c 5d 6s'), b))).toBe(CATEGORY.FLUSH);
    // More cards can only help: the six-card hand contains the five-card one.
    expect(scoreOmahaHigh(hole('Ah Jh 3c 4c 5d 6s'), b)).toBeGreaterThanOrEqual(scoreOmahaHigh(hole('Ah Jh 3c 4c 5d'), b));
  });
});

describe('short deck: a smaller deck changes what beats what', () => {
  it('deals from 36 cards, with nothing below a six', () => {
    const deck = VARIANTS.shortdeck.deck();
    expect(deck).toHaveLength(36);
    expect(deck.some((c) => '2345'.includes(c[0]))).toBe(false);
  });

  it('ranks a flush above a full house, which is why the deck is short', () => {
    expect(five('Ah Kh 9h 8h 6h')).toBeGreaterThan(five('9c 9d 9s Kc Kd'));
    // And still below four of a kind.
    expect(five('9c 9d 9s 9h Kd')).toBeGreaterThan(five('Ah Kh 9h 8h 6h'));
  });

  it('counts A-6-7-8-9 as the lowest straight', () => {
    expect(shortCategory('Ac 6d 7h 8s 9c')).toBe(CATEGORY.STRAIGHT);
    // Lowest of all straights: beaten by the next one up.
    expect(five('6d 7h 8s 9c Td')).toBeGreaterThan(five('Ac 6d 7h 8s 9c'));
    // And it is still a straight flush when suited.
    expect(shortCategory('Ac 6c 7c 8c 9c')).toBe(CATEGORY.STRAIGHT_FLUSH);
  });

  it('keeps a straight above three of a kind, the ruleset this deck uses', () => {
    expect(five('6d 7h 8s 9c Td')).toBeGreaterThan(five('9c 9d 9s Kc Qd'));
  });

  it('leaves the ace playing high as well', () => {
    expect(shortCategory('Tc Jd Qh Ks Ac')).toBe(CATEGORY.STRAIGHT);
    expect(five('Tc Jd Qh Ks Ac')).toBeGreaterThan(five('9c Td Jh Qs Kc'));
  });
});

describe('the eight-or-better low', () => {
  const b = board('2c 3d 7h Ks Qc');

  it('qualifies only with five distinct ranks of eight or lower', () => {
    expect(scoreOmahaLow(hole('Ac 4d Kh Qs'), b)).toBeGreaterThanOrEqual(0);
    // Nine and ten cannot make a low with this board: 2, 3, 7 plus 9, T.
    expect(scoreOmahaLow(hole('9c Td Kh Qs'), b)).toBe(-1);
    // A pair does not count as two of the five ranks.
    expect(scoreOmahaLow(hole('2h 3s Kh Qs'), b)).toBe(-1);
  });

  it('ranks the wheel best, and decides on the worst card', () => {
    const wheel = scoreOmahaLow(hole('Ac 4d Kh Qs'), b);     // A-2-3-4-7
    const worse = scoreOmahaLow(hole('5c 6d Kh Qs'), b);     // 2-3-5-6-7
    expect(wheel).toBeLessThan(worse);
    const eight = scoreOmahaLow(hole('8c 4d Kh Qs'), b);     // 2-3-4-7-8
    expect(eight).toBeGreaterThan(wheel);
  });

  it('uses exactly two hole cards for the low, as for the high', () => {
    // One low card in hand is not enough when the board shows only three.
    expect(scoreOmahaLow(hole('Ac Kd Qh Js'), b)).toBe(-1);
  });

  it('reports no low when the board cannot make one', () => {
    expect(scoreOmahaLow(hole('Ac 2d 3h 4s'), board('Kc Qd Jh Ts 9c'))).toBe(-1);
  });
});

describe('the variant registry', () => {
  it('names what it has when asked for one it does not', () => {
    expect(() => variantFor('badugi')).toThrow(/valid: holdem, plo/);
  });

  it('says how many cards each game deals and whether the pot splits', () => {
    expect(VARIANTS.plo.holeCards).toBe(4);
    expect(VARIANTS.plo6.holeCards).toBe(6);
    expect(VARIANTS['omaha-hi-lo'].split).toBe('hi-lo');
    expect(VARIANTS.holdem.split).toBe('high');
  });
});
