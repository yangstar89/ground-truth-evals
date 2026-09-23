/**
 * The games the oracle can compute equity for.
 *
 * Each variant says how many cards a player holds, which deck it is dealt
 * from, how a hand is scored against a finished board, and whether the pot can
 * split two ways. The equity engine reads those four things and knows nothing
 * else about any game.
 *
 * Three rules make the variants differ in ways a model gets wrong, which is
 * the point of evaluating them:
 *
 *   Omaha       exactly two hole cards and exactly three board cards. Four
 *               hearts on the board and one in your hand is not a flush - and
 *               it is the mistake everyone makes first, models included.
 *   short deck  the deuces through fives are gone, so flushes are rarer than
 *               full houses and beat them, and the lowest straight is A-6-7-8-9.
 *   hi-lo       half the pot goes to the best qualifying low (five distinct
 *               ranks, eight or lower, ace counting low), again using exactly
 *               two hole cards - which need not be the two the high hand used.
 *
 * Scoring stays allocation-free: the combination index tables are built once,
 * and every scorer writes through a caller-owned scratch array.
 */
import { RANKS, SUITS, scoreFivePacked, scoreBestPacked, CATEGORY } from './hand.js';

/** Every k-subset of n indices, as a flat table built once. */
function combinations(n, k) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < n; i++) { acc.push(i); pick(i + 1, acc); acc.pop(); }
  };
  pick(0, []);
  return out;
}

const BOARD_TRIPLES = combinations(5, 3);
const HOLE_PAIRS = { 4: combinations(4, 2), 5: combinations(5, 2), 6: combinations(6, 2) };

/** Rank indices: '6' is 4 and the ace is 12, so a short deck starts at 4. */
const SIX = RANKS.indexOf('6');
const ACE = RANKS.indexOf('A');
/** A-6-7-8-9, the lowest straight once the low cards are gone. */
const SHORT_WHEEL = (1 << ACE) | (1 << SIX) | (1 << (SIX + 1)) | (1 << (SIX + 2)) | (1 << (SIX + 3));

const fullDeck = () => {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
};
const shortDeck = () => {
  const deck = [];
  for (const r of RANKS.slice(SIX)) for (const s of SUITS) deck.push(r + s);
  return deck;
};

/**
 * Short-deck five-card score.
 *
 * The standard ruleset (as played on the Triton tour) keeps the usual order
 * except that a flush beats a full house, because with sixteen cards gone a
 * flush is the rarer hand. Some rooms also rank trips above a straight; that
 * is a second ruleset rather than the default, so it is a flag on the
 * variant rather than an assumption baked into the scorer.
 */
export function scoreFivePackedShort(a, b, c, d, e, tripsBeatStraight = false) {
  const base = scoreFivePacked(a, b, c, d, e);
  let category = Math.floor(base / 16 ** 5);
  const tiebreak = base % 16 ** 5;

  // A-6-7-8-9 is a straight here, and the plain scorer cannot know that. It
  // has to be checked even when those cards already score as a flush, or a
  // suited wheel comes out a flush rather than a straight flush.
  if (category !== CATEGORY.STRAIGHT_FLUSH) {
    const mask = (1 << (a & 15)) | (1 << (b & 15)) | (1 << (c & 15)) | (1 << (d & 15)) | (1 << (e & 15));
    if (mask === SHORT_WHEEL) {
      const suited = (a >> 4) === (b >> 4) && (b >> 4) === (c >> 4) && (c >> 4) === (d >> 4) && (d >> 4) === (e >> 4);
      // The nine plays high, which keeps it the lowest straight of all.
      const high = SIX + 3;
      const cat = suited ? CATEGORY.STRAIGHT_FLUSH : CATEGORY.STRAIGHT;
      return rankShort(cat, high * 16 ** 4, tripsBeatStraight);
    }
  }
  return rankShort(category, tiebreak, tripsBeatStraight);
}

/** Re-order the categories for short deck, keeping tiebreaks untouched. */
function rankShort(category, tiebreak, tripsBeatStraight) {
  let c = category;
  // Flush above full house.
  if (category === CATEGORY.FLUSH) c = CATEGORY.FULL_HOUSE;
  else if (category === CATEGORY.FULL_HOUSE) c = CATEGORY.FLUSH;
  if (tripsBeatStraight) {
    if (c === CATEGORY.TRIPS) c = CATEGORY.STRAIGHT;
    else if (c === CATEGORY.STRAIGHT) c = CATEGORY.TRIPS;
  }
  return c * 16 ** 5 + tiebreak;
}

const FIVE_OF_SEVEN_SHORT = combinations(7, 5);

/** Best five of seven, under short-deck rules. */
function scoreBestShort(seven, tripsBeatStraight) {
  let best = -1;
  for (let i = 0; i < FIVE_OF_SEVEN_SHORT.length; i++) {
    const k = FIVE_OF_SEVEN_SHORT[i];
    const s = scoreFivePackedShort(seven[k[0]], seven[k[1]], seven[k[2]], seven[k[3]], seven[k[4]], tripsBeatStraight);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Best high hand from exactly two hole cards and exactly three board cards.
 * Sixty combinations for four hole cards, a hundred for five, and still far
 * cheaper than the board enumeration wrapped around it.
 */
export function scoreOmahaHigh(hole, board) {
  const pairs = HOLE_PAIRS[hole.length];
  if (!pairs) throw new Error(`omaha needs four to six hole cards, got ${hole.length}`);
  let best = -1;
  for (let i = 0; i < pairs.length; i++) {
    const h0 = hole[pairs[i][0]];
    const h1 = hole[pairs[i][1]];
    for (let j = 0; j < BOARD_TRIPLES.length; j++) {
      const t = BOARD_TRIPLES[j];
      const s = scoreFivePacked(h0, h1, board[t[0]], board[t[1]], board[t[2]]);
      if (s > best) best = s;
    }
  }
  return best;
}

/** Low rank order: the ace is the best low card, the eight the worst. */
const LOW_RANK = new Int8Array(13);
for (let r = 0; r < 13; r++) LOW_RANK[r] = -1;
LOW_RANK[ACE] = 0;
for (let r = 0; r <= RANKS.indexOf('8'); r++) LOW_RANK[r] = r + 1;

/**
 * Best qualifying low, or -1 when there is none. Lower is better, so the
 * caller compares with `<`.
 *
 * A low needs five distinct ranks, all eight or lower, again using exactly
 * two hole cards and three board cards - and they need not be the cards the
 * high hand used, which is what makes scooping with one four-card hand
 * possible.
 */
export function scoreOmahaLow(hole, board) {
  const pairs = HOLE_PAIRS[hole.length];
  if (!pairs) throw new Error(`omaha needs four to six hole cards, got ${hole.length}`);
  let best = -1;
  for (let i = 0; i < pairs.length; i++) {
    const h0 = hole[pairs[i][0]];
    const h1 = hole[pairs[i][1]];
    for (let j = 0; j < BOARD_TRIPLES.length; j++) {
      const t = BOARD_TRIPLES[j];
      const value = lowValue(h0, h1, board[t[0]], board[t[1]], board[t[2]]);
      if (value >= 0 && (best < 0 || value < best)) best = value;
    }
  }
  return best;
}

/** Five cards as a low, or -1 if any is above an eight or two ranks repeat. */
function lowValue(a, b, c, d, e) {
  let mask = 0;
  let value = 0;
  const cards = [a, b, c, d, e];
  const ranks = [];
  for (let i = 0; i < 5; i++) {
    const low = LOW_RANK[cards[i] & 15];
    if (low < 0) return -1;
    const bit = 1 << low;
    if (mask & bit) return -1; // a pair cannot be part of a low
    mask |= bit;
    ranks.push(low);
  }
  // Highest card first, so comparison is decided by the worst card, as at
  // the table: 8-7-6-5-4 loses to 8-7-6-5-3.
  ranks.sort((x, y) => y - x);
  for (const r of ranks) value = value * 16 + r;
  return value;
}

/** Scoring a Hold'em-shaped hand: any five of the seven cards. */
function holdemScorer(hole, board, seven) {
  seven[0] = hole[0];
  seven[1] = hole[1];
  for (let i = 0; i < 5; i++) seven[2 + i] = board[i];
  return scoreBestPacked(seven);
}

export const VARIANTS = {
  holdem: {
    id: 'holdem',
    label: "Texas Hold'em",
    holeCards: 2,
    deck: fullDeck,
    split: 'high',
    rules: 'Any five of your two hole cards and the five board cards.',
    scoreHigh: holdemScorer,
  },
  plo: {
    id: 'plo',
    label: 'Pot-limit Omaha',
    holeCards: 4,
    deck: fullDeck,
    split: 'high',
    rules: 'Exactly two of your four hole cards, plus exactly three board cards.',
    scoreHigh: (hole, board) => scoreOmahaHigh(hole, board),
  },
  plo5: {
    id: 'plo5',
    label: 'Five-card Pot-limit Omaha',
    holeCards: 5,
    deck: fullDeck,
    split: 'high',
    rules: 'Exactly two of your five hole cards, plus exactly three board cards.',
    scoreHigh: (hole, board) => scoreOmahaHigh(hole, board),
  },
  plo6: {
    id: 'plo6',
    label: 'Six-card Pot-limit Omaha',
    holeCards: 6,
    deck: fullDeck,
    split: 'high',
    rules: 'Exactly two of your six hole cards, plus exactly three board cards.',
    scoreHigh: (hole, board) => scoreOmahaHigh(hole, board),
  },
  shortdeck: {
    id: 'shortdeck',
    label: "Short-deck Hold'em (6+)",
    holeCards: 2,
    deck: shortDeck,
    split: 'high',
    rules: 'A 36-card deck: deuces through fives are removed, a flush beats a full house, and A-6-7-8-9 is the lowest straight.',
    scoreHigh: (hole, board, seven) => {
      seven[0] = hole[0];
      seven[1] = hole[1];
      for (let i = 0; i < 5; i++) seven[2 + i] = board[i];
      return scoreBestShort(seven, false);
    },
  },
  'omaha-hi-lo': {
    id: 'omaha-hi-lo',
    label: 'Omaha Hi-Lo (eight or better)',
    holeCards: 4,
    deck: fullDeck,
    split: 'hi-lo',
    rules: 'Exactly two hole cards and three board cards, for the high hand and again for the low. Half the pot goes to the best low of five distinct ranks eight or lower, with the ace low; with no qualifying low, the high hand takes it all.',
    scoreHigh: (hole, board) => scoreOmahaHigh(hole, board),
    scoreLow: (hole, board) => scoreOmahaLow(hole, board),
  },
};

export function variantFor(id = 'holdem') {
  const v = VARIANTS[id];
  if (!v) throw new Error(`unknown variant ${JSON.stringify(id)}; valid: ${Object.keys(VARIANTS).join(', ')}`);
  return v;
}
