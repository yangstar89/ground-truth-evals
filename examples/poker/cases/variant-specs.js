/**
 * The variant dataset, written by hand.
 *
 * Every spot here is chosen because a Hold'em habit gets it wrong. A model
 * that has read a lot of Hold'em will reach for the flush that Omaha does not
 * allow, rank a short-deck full house above a flush, or forget that half the
 * pot can go the other way.
 *
 * As in the Hold'em set, nothing here contains an answer: the generator
 * computes ground truth from the oracle, and the tags exist so the report can
 * say which kind of spot a model fails at rather than blending them.
 */

/** Pot-limit Omaha: four cards, and exactly two of them must play. */
const PLO = [
  // The rule itself. One card of the board's suit is not a flush, and the
  // board cannot be played however good it looks.
  { tag: 'plo-one-card-flush', hero: 'Ah2c3d4s', opponents: ['KhQh7s8d'], board: 'Jh 9h 7h' },
  { tag: 'plo-board-plays', hero: 'Kd7s2h3c', opponents: ['QcQd9s9h'], board: 'Ah As Ad' },
  { tag: 'plo-two-must-play', hero: 'AhKh2c3d', opponents: ['9s9d8c8h'], board: 'Qh Jh 4h' },

  // Premium starting hands, where the Hold'em intuition that aces are a big
  // favourite is much weaker with four cards out.
  { tag: 'plo-aces', hero: 'AcAdKcKd', opponents: ['QhQsJhJs'] },
  { tag: 'plo-aces', hero: 'AcAd7h2s', opponents: ['9c8d7s6h'] },
  { tag: 'plo-rundown', hero: '9c8d7s6h', opponents: ['AhAsKdQc'] },

  // Draws, which in Omaha are often favourites over made hands.
  { tag: 'plo-wrap-vs-set', hero: 'JhTd9c8s', opponents: ['7c7d2h3s'], board: '7h 6d 2c' },
  { tag: 'plo-nut-draw-vs-top-set', hero: 'AhKh2c3d', opponents: ['QcQdQh9s'], board: 'Qs Jh 4h' },
  { tag: 'plo-made-vs-draw', hero: 'AcAd5h5s', opponents: ['KhQhJhTs'], board: '5c 9h 2d' },

  // Multiway and unknown opponents, where equity drops faster than it does
  // heads-up.
  { tag: 'plo-multiway', hero: 'AcAdKcKd', numOpponents: 2 },
  { tag: 'plo-multiway', hero: 'AcAdKcKd', opponents: ['QhQsJhJs', '9c9d8s8h'], board: '2c 7d 9h' },
  { tag: 'plo-turn', hero: 'AhKh2c3d', opponents: ['QcQd9s9h'], board: 'Qh Jh 4c 2d' },
];

/** Five- and six-card Omaha: the same rule, with more ways to miss it. */
const PLO5 = [
  { tag: 'plo5-aces', hero: 'AcAdKcKd5s', opponents: ['QhQsJhJs4d'] },
  { tag: 'plo5-one-card-flush', hero: 'Ah2c3d4s5c', opponents: ['KhQh7s8d9d'], board: 'Jh 9h 7h' },
  { tag: 'plo5-draw-heavy', hero: 'JhTd9c8s7h', opponents: ['AcAdKsQd2c'], board: '6h 5d 2s' },
  { tag: 'plo5-turn', hero: 'AhKh2c3d4s', opponents: ['QcQd9s9h8d'], board: 'Qh Jh 4c 2d' },
];

const PLO6 = [
  { tag: 'plo6-aces', hero: 'AcAdKcKd5s6s', opponents: ['QhQsJhJs4d3d'] },
  { tag: 'plo6-one-card-flush', hero: 'Ah2c3d4s5c6d', opponents: ['KhQh7s8d9d2h'], board: 'Jh 9h 7h' },
  { tag: 'plo6-draw-heavy', hero: 'JhTd9c8s7h6c', opponents: ['AcAdKsQd2c3h'], board: '6h 5d 2s' },
  { tag: 'plo6-flop', hero: 'AcAdKcKd5s6s', opponents: ['QhQsJhJs4d3d'], board: '2c 7d 9h' },
];

/**
 * Short deck: sixteen cards gone, so flushes are rare enough to beat full
 * houses, straights come more often, and A-6-7-8-9 is the low straight.
 */
const SHORT = [
  { tag: 'short-flush-beats-boat', hero: '9c9d', opponents: ['AhKh'], board: '9h 8h Qh' },
  { tag: 'short-flush-beats-boat', hero: 'AhKh', opponents: ['9c9d'], board: '9h 8h Qh' },
  { tag: 'short-wheel-straight', hero: 'Ac6d', opponents: ['KhKs'], board: '7h 8s 9c' },
  { tag: 'short-premium', hero: 'AcAd', opponents: ['KhKs'] },
  { tag: 'short-overcards', hero: 'AhKh', opponents: ['QsQd'] },
  { tag: 'short-connectors', hero: 'Ts9s', opponents: ['AcAd'] },
  { tag: 'short-draw-vs-pair', hero: 'JhTh', opponents: ['AcAd'], board: '9c 8d 6s' },
  { tag: 'short-multiway', hero: 'AcAd', numOpponents: 2 },
];

/**
 * Omaha Hi-Lo: half the pot follows the best low of five distinct ranks eight
 * or lower, and a hand can win both halves at once.
 */
const HILO = [
  // A low that is already made, against a high hand with no low.
  { tag: 'hilo-made-low', hero: 'Ac2d9s9c', opponents: ['KhKsQdJd'], board: '3h 7s 8d' },
  // The same shape, but the board can still counterfeit the low.
  { tag: 'hilo-counterfeit-risk', hero: 'Ac2dKsQc', opponents: ['9h9sJdTd'], board: '3h 4s 8d' },
  // A board with no low at all, where the whole pot goes to the high hand.
  { tag: 'hilo-no-low-board', hero: 'Ac2d3s4c', opponents: ['KhQdJhTs'], board: 'Kc Qh 9d' },
  // Scoop potential: the nut low draw with the nut flush draw.
  { tag: 'hilo-scoop-draw', hero: 'Ah2h3s4c', opponents: ['KhKsQdQc'], board: '5h 9h Kd' },
  // Aces in hi-lo, which play for both halves.
  { tag: 'hilo-aces', hero: 'AcAd2s3c', opponents: ['KhQhJsTs'] },
  { tag: 'hilo-high-only', hero: 'KhKsQdQc', opponents: ['Ac2d3s4c'] },
  { tag: 'hilo-quartered', hero: 'Ac2d9h9s', opponents: ['Ah2h8c8d'], board: '3c 4d 7s' },
  { tag: 'hilo-multiway', hero: 'Ac2d3s4c', numOpponents: 2 },
];

/** Every variant spot, with the game it belongs to attached. */
export const VARIANT_EQUITY_SPECS = [
  ...PLO.map((s) => ({ ...s, variant: 'plo' })),
  ...PLO5.map((s) => ({ ...s, variant: 'plo5' })),
  ...PLO6.map((s) => ({ ...s, variant: 'plo6' })),
  ...SHORT.map((s) => ({ ...s, variant: 'shortdeck' })),
  ...HILO.map((s) => ({ ...s, variant: 'omaha-hi-lo' })),
];
