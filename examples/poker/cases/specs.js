/**
 * The dataset, written by hand.
 *
 * This file is the eval, far more than the graders are. A harness that only
 * asks easy questions reports a high number and tells you nothing, so the spots
 * below are chosen to spread across the situations where a model can plausibly
 * go wrong, and each carries a `tag` so the report can break results down by
 * kind of spot rather than blending everything into one percentage.
 *
 * Nothing here contains an answer. The generator computes ground truth from the
 * oracle, which is the only thing that decides what is correct.
 */

/**
 * Equity spots.
 *
 * `opponents` means known hole cards; `numOpponents` means unknown ones. Where
 * the board is far enough along the generator will enumerate every remaining
 * card and the case is exact; preflop and multiway spots get a seeded sample.
 */
export const EQUITY_SPECS = [
  // Premium against premium: the textbook numbers, and a model that has
  // memorised anything should get these.
  { tag: 'premium-vs-premium', hero: 'AcAd', opponents: ['KcKd'] },
  { tag: 'premium-vs-premium', hero: 'KsKh', opponents: ['QcQd'] },
  { tag: 'premium-vs-premium', hero: 'AcAd', opponents: ['AhKs'] },

  // The classic race: a pair against two overcards is close to a coinflip, and
  // being wrong here by much suggests guessing rather than knowing.
  { tag: 'flip', hero: 'AsKs', opponents: ['QcQd'] },
  { tag: 'flip', hero: 'JcJd', opponents: ['AhKh'] },
  { tag: 'flip', hero: '8c8d', opponents: ['TsJs'] },

  // Dominated hands: sharing a rank changes the answer a lot, and it is a
  // common place for a confident wrong answer.
  { tag: 'dominated', hero: 'AhKd', opponents: ['AsQh'] },
  { tag: 'dominated', hero: 'AhQd', opponents: ['AsJh'] },
  { tag: 'dominated', hero: 'KhQd', opponents: ['KsJh'] },

  // Long shots, where the honest answer is a small number.
  { tag: 'longshot', hero: '7h2s', opponents: ['AcAd'] },
  { tag: 'longshot', hero: '3c2d', opponents: ['KsKh'] },

  // Flops, all enumerable and therefore exact.
  { tag: 'made-vs-draw', hero: 'AcAd', opponents: ['7h8h'], board: '2h 9h Kd' },
  { tag: 'made-vs-draw', hero: 'KsKd', opponents: ['JhTh'], board: '9h Qh 2c' },
  { tag: 'made-vs-draw', hero: 'QcQd', opponents: ['AhKs'], board: '2c 7d 9h' },
  { tag: 'set-vs-overpair', hero: '7c7d', opponents: ['AcAh'], board: '7h 2d 9s' },
  { tag: 'two-pair-vs-draw', hero: 'AcKd', opponents: ['QhJh'], board: 'Ah Kc 3h' },
  { tag: 'underdog-flop', hero: 'AhQh', opponents: ['KsKd'], board: '2c 7d 9s' },
  { tag: 'flush-draw-vs-pair', hero: 'AhTh', opponents: ['9c9d'], board: '2h 7h Kc' },
  { tag: 'open-ender-vs-pair', hero: 'Jc Td', opponents: ['AcAd'], board: '9h 8s 2c' },
  { tag: 'dry-flop-domination', hero: 'AcKc', opponents: ['AhQd'], board: '2c 7d 9h' },

  // Turns: one card left, so the answer is a simple fraction and a model that
  // reasons rather than recalls should do well.
  { tag: 'turn-draw', hero: 'AhTh', opponents: ['9c9d'], board: '2h 7h Kc 4s' },
  { tag: 'turn-behind', hero: 'AcKd', opponents: ['7h7s'], board: '2c 9d Jh 4s' },
  { tag: 'turn-ahead', hero: 'QcQd', opponents: ['AhKs'], board: '2c 7d 9h 3s' },

  // Rivers: no cards to come, so equity is 1, 0 or exactly a half. A model that
  // hedges on a finished board is telling you something.
  { tag: 'river-won', hero: 'AcAd', opponents: ['KcKd'], board: '2c 7d 9h Js 4c' },
  { tag: 'river-lost', hero: 'KcKd', opponents: ['AcAd'], board: '2c 7d 9h Js 4c' },
  { tag: 'river-chop', hero: 'AcAd', opponents: ['KcKd'], board: '5h 6h 7s 8d 9c' },

  // Multiway against unknown hands: sampled, and the point is that equity falls
  // as opponents are added.
  { tag: 'multiway-preflop', hero: 'AcAd', numOpponents: 3 },
  { tag: 'multiway-preflop', hero: 'AcAd', numOpponents: 8 },
  { tag: 'multiway-preflop', hero: 'JcTc', numOpponents: 5 },
  { tag: 'multiway-flop', hero: 'AhKh', numOpponents: 3, board: '2h 9h Qd' },
  { tag: 'multiway-flop', hero: '5c5d', numOpponents: 4, board: '5h Kd 2s' },
];

/**
 * ICM spots.
 *
 * The model has to notice that chips are not money: a chip leader's equity is
 * always worth less than their share of the chips, and the gap grows as the
 * payouts flatten.
 */
export const ICM_SPECS = [
  { tag: 'even-three', stacks: [3000, 3000, 3000], payouts: [500, 300, 200] },
  { tag: 'leader-three', stacks: [7000, 1500, 1500], payouts: [500, 300, 200] },
  { tag: 'shortstack-three', stacks: [500, 4500, 5000], payouts: [500, 300, 200] },
  { tag: 'bubble-three', stacks: [4000, 4000, 2000], payouts: [600, 400, 0] },
  { tag: 'flat-payouts', stacks: [8000, 1000, 1000], payouts: [400, 350, 250] },
  { tag: 'steep-payouts', stacks: [8000, 1000, 1000], payouts: [800, 150, 50] },
  { tag: 'heads-up', stacks: [6000, 4000], payouts: [650, 350] },
  { tag: 'heads-up-lopsided', stacks: [9500, 500], payouts: [650, 350] },
  { tag: 'four-handed', stacks: [4000, 3000, 2000, 1000], payouts: [500, 300, 150, 50] },
  { tag: 'four-handed-even', stacks: [2500, 2500, 2500, 2500], payouts: [500, 300, 150, 50] },
  { tag: 'five-handed', stacks: [5000, 3000, 2000, 1500, 1000], payouts: [400, 250, 175, 125, 50] },
  { tag: 'five-handed-leader', stacks: [10000, 750, 750, 750, 750], payouts: [400, 250, 175, 125, 50] },
  { tag: 'six-handed', stacks: [3000, 2500, 2000, 1500, 1000, 500], payouts: [350, 225, 150, 125, 100, 50] },
  { tag: 'final-table-bubble', stacks: [2000, 2000, 2000, 2000, 100], payouts: [500, 300, 200, 0, 0] },
  { tag: 'more-players-than-payouts', stacks: [3000, 2000, 2000, 1500, 1500], payouts: [700, 300] },
  { tag: 'one-payout', stacks: [5000, 3000, 2000], payouts: [1000] },
];

/**
 * Preflop range spots, as (position, scenario, hand) triples against the chart.
 *
 * Deliberately weighted toward the edges of each range: the middle of a chart
 * is easy and tells you little, and the hands that separate a model that knows
 * the ranges from one that is guessing sit right on the boundary.
 */
export const RANGE_SPECS = [
  // Trivially inside every range.
  { tag: 'premium', position: 'UTG', scenario: 'RFI', hand: 'AA' },
  { tag: 'premium', position: 'UTG', scenario: 'RFI', hand: 'AKs' },
  { tag: 'premium', position: 'CO', scenario: 'RFI', hand: 'QQ' },

  // Trivially outside every range.
  { tag: 'trash', position: 'UTG', scenario: 'RFI', hand: '72o' },
  { tag: 'trash', position: 'BTN', scenario: 'RFI', hand: '32o' },
  { tag: 'trash', position: 'CO', scenario: 'RFI', hand: '84o' },

  // The same hand across positions: the answer is supposed to change, and a
  // model that ignores position will be wrong on exactly one side of this.
  { tag: 'position-sensitive', position: 'UTG', scenario: 'RFI', hand: '55' },
  { tag: 'position-sensitive', position: 'BTN', scenario: 'RFI', hand: '55' },
  { tag: 'position-sensitive', position: 'UTG', scenario: 'RFI', hand: 'A9o' },
  { tag: 'position-sensitive', position: 'BTN', scenario: 'RFI', hand: 'A9o' },
  { tag: 'position-sensitive', position: 'UTG', scenario: 'RFI', hand: 'KJo' },
  { tag: 'position-sensitive', position: 'BTN', scenario: 'RFI', hand: 'KJo' },
  { tag: 'position-sensitive', position: 'UTG', scenario: 'RFI', hand: '76s' },
  { tag: 'position-sensitive', position: 'BTN', scenario: 'RFI', hand: '76s' },

  // Suited wheel aces and suited connectors: in some ranges, out of others.
  { tag: 'boundary', position: 'CO', scenario: 'RFI', hand: 'A5s' },
  { tag: 'boundary', position: 'UTG', scenario: 'RFI', hand: 'A5s' },
  { tag: 'boundary', position: 'HJ', scenario: 'RFI', hand: 'T9s' },
  { tag: 'boundary', position: 'HJ', scenario: 'RFI', hand: '54s' },
  { tag: 'boundary', position: 'SB', scenario: 'RFI', hand: 'K9s' },
  { tag: 'boundary', position: 'SB', scenario: 'RFI', hand: 'QTo' },

  // Defending the big blind, where calling is a real option rather than a
  // rounding error - and the correct answer differs by who opened.
  { tag: 'bb-defence', position: 'BB', scenario: 'vsUTG', hand: 'AJo' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsUTG', hand: '76s' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsUTG', hand: '22' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsBTN', hand: 'AJo' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsBTN', hand: '76s' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsBTN', hand: 'J8s' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsBTN', hand: 'T7o' },
  { tag: 'bb-defence', position: 'BB', scenario: 'vsBTN', hand: '93o' },
];
