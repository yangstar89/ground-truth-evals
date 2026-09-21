/**
 * Cards and a seven-card hand evaluator.
 *
 * This is the foundation the whole harness rests on: if the evaluator is wrong
 * then every expected value in every case file is wrong, and the eval grades
 * models against nonsense. So the shape is the dull, obvious one - score all
 * twenty-one five-card subsets of seven and keep the best - and the speed comes
 * from not allocating rather than from anything clever. It sits inside board
 * enumerations of up to hundreds of thousands of boards, so allocation in this
 * function is the whole cost of the tool.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

/** Rank index 0..12 (deuce..ace). */
export const rankOf = (card) => RANKS.indexOf(card[0]);
/** Suit index 0..3. */
export const suitOf = (card) => SUITS.indexOf(card[1]);

/**
 * Parse "AhKd" or "Ah Kd" or ["Ah","Kd"] into a normalised card array.
 * Throws on anything it cannot read: a silently mis-parsed hand would produce a
 * plausible-looking but wrong expected value, which is the worst failure this
 * code could have.
 */
export function parseCards(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input).trim().split(/[\s,]+/).filter(Boolean).flatMap((tok) =>
        tok.length > 2 ? tok.match(/.{2}/g) ?? [] : [tok],
      );
  const out = raw.map((c) => {
    if (typeof c !== 'string' || c.length !== 2) throw new Error(`bad card: ${JSON.stringify(c)}`);
    const r = c[0].toUpperCase();
    const s = c[1].toLowerCase();
    if (!RANKS.includes(r) || !SUITS.includes(s)) throw new Error(`bad card: ${c}`);
    return r + s;
  });
  const seen = new Set(out);
  if (seen.size !== out.length) throw new Error(`duplicate card in ${out.join(' ')}`);
  return out;
}

/** The full 52-card deck, minus anything in `dead`. */
export function deckWithout(dead = []) {
  const gone = new Set(dead);
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) {
    const c = r + s;
    if (!gone.has(c)) deck.push(c);
  }
  return deck;
}

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

/** Five consecutive rank bits, or the wheel, where the ace plays low. */
const WHEEL = (1 << 12) | 0b1111;

/**
 * Pack a card as rank | suit<<4, so the evaluator never touches a string.
 * Enumeration converts once, up front, and then works in integers.
 */
export function packCard(card) {
  return rankOf(card) | (suitOf(card) << 4);
}
export const packCards = (cards) => cards.map(packCard);

// Scratch space. scoreFivePacked is not reentrant, which is fine: it is a leaf.
const RC = new Int8Array(13);
const SC = new Int8Array(4);

/**
 * Score exactly five packed cards. Higher is better, and scores are comparable
 * across categories: the category occupies the top digit and the tiebreak
 * ranks, most significant first, occupy five base-16 digits below it.
 */
export function scoreFivePacked(a, b, c, d, e) {
  RC[0] = 0; RC[1] = 0; RC[2] = 0; RC[3] = 0; RC[4] = 0; RC[5] = 0; RC[6] = 0;
  RC[7] = 0; RC[8] = 0; RC[9] = 0; RC[10] = 0; RC[11] = 0; RC[12] = 0;
  SC[0] = 0; SC[1] = 0; SC[2] = 0; SC[3] = 0;

  let mask = 0;
  let r;
  r = a & 15; RC[r]++; SC[a >> 4]++; mask |= 1 << r;
  r = b & 15; RC[r]++; SC[b >> 4]++; mask |= 1 << r;
  r = c & 15; RC[r]++; SC[c >> 4]++; mask |= 1 << r;
  r = d & 15; RC[r]++; SC[d >> 4]++; mask |= 1 << r;
  r = e & 15; RC[r]++; SC[e >> 4]++; mask |= 1 << r;

  const flush = SC[0] === 5 || SC[1] === 5 || SC[2] === 5 || SC[3] === 5;

  // Five distinct ranks is a precondition for a straight, and with five cards
  // it means the mask has exactly five bits.
  let straightHigh = -1;
  let bits = mask;
  let distinct = 0;
  while (bits) { bits &= bits - 1; distinct++; }
  if (distinct === 5) {
    for (let hi = 12; hi >= 4; hi--) {
      if (((mask >> (hi - 4)) & 0b11111) === 0b11111) { straightHigh = hi; break; }
    }
    if (straightHigh < 0 && mask === WHEEL) straightHigh = 3;
  }

  let category;
  let t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0;

  if (flush && straightHigh >= 0) {
    category = CATEGORY.STRAIGHT_FLUSH;
    t0 = straightHigh;
  } else {
    // Walk the ranks once, high to low, collecting by count.
    let quad = -1, trip = -1, pairHi = -1, pairLo = -1;
    let k0 = -1, k1 = -1, k2 = -1, k3 = -1, k4 = -1;
    for (let rr = 12; rr >= 0; rr--) {
      const n = RC[rr];
      if (n === 0) continue;
      if (n === 4) quad = rr;
      else if (n === 3) trip = rr;
      else if (n === 2) { if (pairHi < 0) pairHi = rr; else pairLo = rr; }
      else if (k0 < 0) k0 = rr;
      else if (k1 < 0) k1 = rr;
      else if (k2 < 0) k2 = rr;
      else if (k3 < 0) k3 = rr;
      else k4 = rr;
    }
    if (quad >= 0) {
      category = CATEGORY.QUADS; t0 = quad; t1 = k0;
    } else if (trip >= 0 && pairHi >= 0) {
      category = CATEGORY.FULL_HOUSE; t0 = trip; t1 = pairHi;
    } else if (flush) {
      category = CATEGORY.FLUSH; t0 = k0; t1 = k1; t2 = k2; t3 = k3; t4 = k4;
    } else if (straightHigh >= 0) {
      category = CATEGORY.STRAIGHT; t0 = straightHigh;
    } else if (trip >= 0) {
      category = CATEGORY.TRIPS; t0 = trip; t1 = k0; t2 = k1;
    } else if (pairLo >= 0) {
      category = CATEGORY.TWO_PAIR; t0 = pairHi; t1 = pairLo; t2 = k0;
    } else if (pairHi >= 0) {
      category = CATEGORY.PAIR; t0 = pairHi; t1 = k0; t2 = k1; t3 = k2;
    } else {
      category = CATEGORY.HIGH_CARD; t0 = k0; t1 = k1; t2 = k2; t3 = k3; t4 = k4;
    }
  }

  return ((((category * 16 + t0) * 16 + t1) * 16 + t2) * 16 + t3) * 16 + t4;
}

const FIVE_OF_SEVEN = (() => {
  const combos = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) combos.push([a, b, c, d, e]);
  return combos;
})();

/** Best five-card score from five to seven packed cards. */
export function scoreBestPacked(p) {
  const n = p.length;
  if (n === 5) return scoreFivePacked(p[0], p[1], p[2], p[3], p[4]);
  if (n < 5 || n > 7) throw new Error(`need five to seven cards, got ${n}`);
  let best = -1;
  if (n === 7) {
    for (let i = 0; i < FIVE_OF_SEVEN.length; i++) {
      const k = FIVE_OF_SEVEN[i];
      const s = scoreFivePacked(p[k[0]], p[k[1]], p[k[2]], p[k[3]], p[k[4]]);
      if (s > best) best = s;
    }
    return best;
  }
  for (let skip = 0; skip < 6; skip++) {
    let i = 0;
    const q = [0, 0, 0, 0, 0];
    for (let j = 0; j < 6; j++) if (j !== skip) q[i++] = p[j];
    const s = scoreFivePacked(q[0], q[1], q[2], q[3], q[4]);
    if (s > best) best = s;
  }
  return best;
}

/** String-taking conveniences, for tests and one-off use. */
export const scoreFive = (cards) => {
  const p = packCards(cards);
  return scoreFivePacked(p[0], p[1], p[2], p[3], p[4]);
};
export const scoreBest = (cards) => scoreBestPacked(packCards(cards));

/** Which category a score belongs to. */
export const categoryOf = (score) => Math.floor(score / 16 ** 5);
