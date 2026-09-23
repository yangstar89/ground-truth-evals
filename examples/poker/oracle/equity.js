/**
 * Hold'em equity, computed from scratch.
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
 */
import { deckWithout, packCards, parseCards, scoreBestPacked } from './hand.js';

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
function showdown(heroScore, oppScores) {
  let ties = 1;
  for (let i = 0; i < oppScores.length; i++) {
    const s = oppScores[i];
    if (s > heroScore) return 0;
    if (s === heroScore) ties++;
  }
  return 1 / ties;
}

function validate(hero, opps, board) {
  if (hero.length !== 2) throw new Error('hero needs exactly two cards');
  for (const o of opps) if (o.length !== 2) throw new Error('each opponent needs exactly two cards');
  const toCome = STREETS[board.length];
  if (toCome === undefined) throw new Error(`board must have 0, 3, 4 or 5 cards, got ${board.length}`);
  const all = [...hero, ...opps.flat(), ...board];
  if (new Set(all).size !== all.length) throw new Error('duplicate card across hands and board');
  return toCome;
}

/**
 * Exact equity against known opponent hands, by walking every remaining board.
 * Throws rather than silently sampling when the space is larger than the cap,
 * so "exact" in a case file always means exact.
 */
export function enumerateEquity(heroInput, oppInputs, boardInput = [], { cap = MAX_ENUMERATION } = {}) {
  const hero = parseCards(heroInput);
  const opps = oppInputs.map(parseCards);
  const board = parseCards(boardInput);
  const toCome = validate(hero, opps, board);

  const pool = deckWithout([...hero, ...opps.flat(), ...board]);
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

  let total = 0;
  let count = 0;
  const seven = new Array(7);
  const extra = new Array(toCome);

  const walk = (start, depth) => {
    if (depth === toCome) {
      let i = 0;
      seven[i++] = heroP[0];
      seven[i++] = heroP[1];
      for (let b = 0; b < boardP.length; b++) seven[i++] = boardP[b];
      for (let e = 0; e < toCome; e++) seven[i++] = extra[e];
      const heroScore = scoreBestPacked(seven);
      const oppScores = [];
      for (let o = 0; o < oppsP.length; o++) {
        let j = 0;
        seven[j++] = oppsP[o][0];
        seven[j++] = oppsP[o][1];
        for (let b = 0; b < boardP.length; b++) seven[j++] = boardP[b];
        for (let e = 0; e < toCome; e++) seven[j++] = extra[e];
        oppScores.push(scoreBestPacked(seven));
      }
      total += showdown(heroScore, oppScores);
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
  { opponents = [], numOpponents = 0, board: boardInput = [], seed = 1, iterations = 60000 } = {},
) {
  const hero = parseCards(heroInput);
  const opps = opponents.map(parseCards);
  const board = parseCards(boardInput);
  const toCome = validate(hero, opps, board);
  const totalOpps = opps.length + numOpponents;
  if (totalOpps < 1) throw new Error('need at least one opponent');

  const pool = packCards(deckWithout([...hero, ...opps.flat(), ...board]));
  const heroP = packCards(hero);
  const oppsP = opps.map(packCards);
  const boardP = packCards(board);

  const need = toCome + numOpponents * 2;
  if (need > pool.length) throw new Error('not enough cards left for that many opponents');

  const next = rng(seed);
  const seven = new Array(7);
  let total = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Partial Fisher-Yates: only the cards actually needed get shuffled.
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(next() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const fill = (holeA, holeB) => {
      let i = 0;
      seven[i++] = holeA;
      seven[i++] = holeB;
      for (let b = 0; b < boardP.length; b++) seven[i++] = boardP[b];
      for (let e = 0; e < toCome; e++) seven[i++] = pool[e];
      return scoreBestPacked(seven);
    };
    const heroScore = fill(heroP[0], heroP[1]);
    const oppScores = [];
    for (let o = 0; o < oppsP.length; o++) oppScores.push(fill(oppsP[o][0], oppsP[o][1]));
    for (let o = 0; o < numOpponents; o++) {
      const at = toCome + o * 2;
      oppScores.push(fill(pool[at], pool[at + 1]));
    }
    total += showdown(heroScore, oppScores);
  }

  return { equity: total / iterations, samples: iterations, method: 'sample', exact: false, seed };
}

/**
 * The entry point case generation uses: enumerate when the space is small
 * enough to be exact, sample when it is not. Keeping the choice here means a
 * case file always records which it got, rather than the caller guessing.
 */
export function equity(spec) {
  const { hero, board = [], opponents = [], numOpponents = 0, seed = 1, iterations, cap = MAX_ENUMERATION } = spec;
  const known = opponents.length > 0;
  if (known && numOpponents === 0) {
    const dead = [hero, ...opponents, board].flatMap((x) => parseCards(x));
    const toCome = STREETS[parseCards(board).length];
    const boards = choose(52 - dead.length, toCome);
    if (boards <= cap) return enumerateEquity(hero, opponents, board, { cap });
  }
  return sampleEquity(hero, { opponents, numOpponents, board, seed, iterations });
}
