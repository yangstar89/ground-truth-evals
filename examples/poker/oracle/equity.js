/**
 * Poker equity, computed from scratch.
 *
 * Deliberately not borrowed from an existing engine. A grader that shares code
 * with the thing it grades can only ever confirm that the two agree, and the
 * point is an independent source of truth.
 *
 * Two regimes, and which one produced a number is always recorded:
 *
 *   enumerate  every remaining board is walked, so the answer is not an
 *              estimate at all. Cheap after the flop, and for two known hands
 *              on a flop it is C(45,2) = 990 boards.
 *   sample     a seeded draw, for spaces too large to walk - heads-up preflop
 *              is already 1.7 million boards, and unknown opponents multiply
 *              that by every hand they could hold. The seed travels with the
 *              case, so a case file replays identically on any machine.
 *
 * The game is a parameter. A variant says how many cards a player holds, which
 * deck they come from, how a hand is scored, and whether the pot splits; this
 * file knows nothing else about any of them. Hold'em is the default, and its
 * path through here is the same one it always took.
 */
import { deckWithout, packCards, parseCards } from './hand.js';
import { variantFor } from './variants.js';

/** Board cards still to come, by how many are already out. */
const STREETS = { 0: 5, 3: 2, 4: 1, 5: 0 };

/**
 * Boards worth walking rather than sampling. Chosen so that everything from
 * the flop on enumerates, and preflop samples: the point of the cap is that
 * nobody accidentally waits three minutes for a case file.
 */
export const MAX_ENUMERATION = 300000;

/** mulberry32: small, fast, fully determined by its seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** C(n, k), exactly, for the sizes this tool sees. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
  return Math.round(out);
}

/**
 * One showdown: 1 for a win, 0 for a loss, 1/n for an n-way chop. Splitting
 * ties is what makes this equity rather than win rate, and it matches the
 * standard definition (win + tie/2 heads-up).
 */
function showdown(heroScore, oppScores, count) {
  let ties = 1;
  for (let i = 0; i < count; i++) {
    const s = oppScores[i];
    if (s > heroScore) return 0;
    if (s === heroScore) ties++;
  }
  return 1 / ties;
}

/**
 * One split-pot showdown. Half the pot follows the best high hand and half the
 * best qualifying low, where a lower score is a better low and -1 means no
 * low at all. With nobody qualifying, the high hand takes the lot - which is
 * why a hi-lo equity is not simply two equities averaged.
 */
function showdownHiLo(heroHigh, oppHigh, heroLow, oppLow, count) {
  let highTies = 1;
  let heroWinsHigh = true;
  for (let i = 0; i < count; i++) {
    if (oppHigh[i] > heroHigh) { heroWinsHigh = false; break; }
    if (oppHigh[i] === heroHigh) highTies++;
  }
  const highShare = heroWinsHigh ? 1 / highTies : 0;

  let bestLow = heroLow;
  let lowTies = heroLow >= 0 ? 1 : 0;
  for (let i = 0; i < count; i++) {
    const l = oppLow[i];
    if (l < 0) continue;
    if (bestLow < 0 || l < bestLow) { bestLow = l; lowTies = 1; }
    else if (l === bestLow) lowTies++;
  }
  // No qualifying low anywhere: the high hand scoops.
  if (bestLow < 0) return highShare;
  const lowShare = heroLow >= 0 && heroLow === bestLow ? 1 / lowTies : 0;
  return highShare / 2 + lowShare / 2;
}

function validate(hero, opps, board, variant) {
  const want = variant.holeCards;
  if (hero.length !== want) throw new Error(`hero needs exactly ${want} cards in ${variant.label}, got ${hero.length}`);
  for (const o of opps) {
    if (o.length !== want) throw new Error(`each opponent needs exactly ${want} cards in ${variant.label}, got ${o.length}`);
  }
  const toCome = STREETS[board.length];
  if (toCome === undefined) throw new Error(`board must have 0, 3, 4 or 5 cards, got ${board.length}`);
  const all = [...hero, ...opps.flat(), ...board];
  if (new Set(all).size !== all.length) throw new Error('duplicate card across hands and board');
  // A short deck has no deuces; a card that is not in the deck is a typo, not
  // a hand, and quietly enumerating around it would answer a different spot.
  const deck = new Set(variant.deck());
  for (const c of all) {
    if (!deck.has(c)) throw new Error(`${c} is not in the ${variant.label} deck`);
  }
  return toCome;
}

/** The cards a variant can still deal, once the known ones are out. */
function poolFor(variant, dead) {
  return variant.deck === undefined ? deckWithout(dead) : variant.deck().filter((c) => !dead.includes(c));
}

/**
 * Exact equity against known opponent hands, by walking every remaining board.
 * Throws rather than silently sampling when the space is larger than the cap,
 * so "exact" in a case file always means exact.
 */
export function enumerateEquity(heroInput, oppInputs, boardInput = [], { cap = MAX_ENUMERATION, variant: variantId = 'holdem' } = {}) {
  const variant = variantFor(variantId);
  const hero = parseCards(heroInput);
  const opps = oppInputs.map(parseCards);
  const board = parseCards(boardInput);
  const toCome = validate(hero, opps, board, variant);

  const pool = poolFor(variant, [...hero, ...opps.flat(), ...board]);
  const boards = choose(pool.length, toCome);
  if (boards > cap) {
    throw new Error(
      `enumerating ${boards} boards exceeds the cap of ${cap}; sample this spot instead`,
    );
  }

  const heroP = packCards(hero);
  const oppsP = opps.map(packCards);
  const boardP = packCards(board);
  const poolP = packCards(pool);
  const hiLo = variant.split === 'hi-lo';

  let total = 0;
  let count = 0;
  // Scratch, reused for every board: the hot path allocates nothing, because
  // scoring runs once per board per player and there are a great many boards.
  const seven = new Array(7);
  const full = new Array(5);
  const extra = new Array(toCome);
  const oppHigh = new Float64Array(Math.max(1, oppsP.length));
  const oppLow = new Float64Array(Math.max(1, oppsP.length));

  const walk = (start, depth) => {
    if (depth === toCome) {
      for (let b = 0; b < boardP.length; b++) full[b] = boardP[b];
      for (let e = 0; e < toCome; e++) full[boardP.length + e] = extra[e];
      const heroScore = variant.scoreHigh(heroP, full, seven);
      for (let o = 0; o < oppsP.length; o++) oppHigh[o] = variant.scoreHigh(oppsP[o], full, seven);
      if (hiLo) {
        const heroLow = variant.scoreLow(heroP, full);
        for (let o = 0; o < oppsP.length; o++) oppLow[o] = variant.scoreLow(oppsP[o], full);
        total += showdownHiLo(heroScore, oppHigh, heroLow, oppLow, oppsP.length);
      } else {
        total += showdown(heroScore, oppHigh, oppsP.length);
      }
      count++;
      return;
    }
    for (let i = start; i <= poolP.length - (toCome - depth); i++) {
      extra[depth] = poolP[i];
      walk(i + 1, depth + 1);
    }
  };
  walk(0, 0);

  return { equity: total / count, samples: count, method: 'enumerate', exact: true };
}

/**
 * Sampled equity. Opponents may be known hands, an unknown count, or both:
 * anything unknown is drawn from the remaining deck each iteration.
 */
export function sampleEquity(
  heroInput,
  { opponents = [], numOpponents = 0, board: boardInput = [], seed = 1, iterations = 60000, variant: variantId = 'holdem' } = {},
) {
  const variant = variantFor(variantId);
  const hero = parseCards(heroInput);
  const opps = opponents.map(parseCards);
  const board = parseCards(boardInput);
  const toCome = validate(hero, opps, board, variant);
  const totalOpps = opps.length + numOpponents;
  if (totalOpps < 1) throw new Error('need at least one opponent');

  const pool = packCards(poolFor(variant, [...hero, ...opps.flat(), ...board]));
  const heroP = packCards(hero);
  const oppsP = opps.map(packCards);
  const boardP = packCards(board);
  const hiLo = variant.split === 'hi-lo';
  const hole = variant.holeCards;

  const need = toCome + numOpponents * hole;
  if (need > pool.length) throw new Error('not enough cards left for that many opponents');

  const next = rng(seed);
  const seven = new Array(7);
  const full = new Array(5);
  const drawn = new Array(hole);
  const oppHigh = new Float64Array(totalOpps);
  const oppLow = new Float64Array(totalOpps);
  let total = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Partial Fisher-Yates: only the cards actually needed get shuffled.
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(next() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    for (let b = 0; b < boardP.length; b++) full[b] = boardP[b];
    for (let e = 0; e < toCome; e++) full[boardP.length + e] = pool[e];

    const heroScore = variant.scoreHigh(heroP, full, seven);
    const heroLow = hiLo ? variant.scoreLow(heroP, full) : -1;
    for (let o = 0; o < oppsP.length; o++) {
      oppHigh[o] = variant.scoreHigh(oppsP[o], full, seven);
      if (hiLo) oppLow[o] = variant.scoreLow(oppsP[o], full);
    }
    for (let o = 0; o < numOpponents; o++) {
      const at = toCome + o * hole;
      for (let c = 0; c < hole; c++) drawn[c] = pool[at + c];
      const slot = oppsP.length + o;
      oppHigh[slot] = variant.scoreHigh(drawn, full, seven);
      if (hiLo) oppLow[slot] = variant.scoreLow(drawn, full);
    }
    total += hiLo
      ? showdownHiLo(heroScore, oppHigh, heroLow, oppLow, totalOpps)
      : showdown(heroScore, oppHigh, totalOpps);
  }

  return { equity: total / iterations, samples: iterations, method: 'sample', exact: false, seed };
}

/**
 * The entry point case generation uses: enumerate when the space is small
 * enough to be exact, sample when it is not. Keeping the choice here means a
 * case file always records which it got, rather than the caller guessing.
 */
export function equity(spec) {
  const {
    hero, board = [], opponents = [], numOpponents = 0, seed = 1, iterations,
    cap = MAX_ENUMERATION, variant = 'holdem',
  } = spec;
  const known = opponents.length > 0;
  if (known && numOpponents === 0) {
    const dead = [hero, ...opponents, board].flatMap((x) => parseCards(x));
    const toCome = STREETS[parseCards(board).length];
    const deckSize = variantFor(variant).deck().length;
    const boards = choose(deckSize - dead.length, toCome);
    if (boards <= cap) return enumerateEquity(hero, opponents, board, { cap, variant });
  }
  return sampleEquity(hero, { opponents, numOpponents, board, seed, iterations, variant });
}
