/**
 * Preflop opening and defending ranges, as a 169-hand grid per position.
 *
 * Chart data rather than anything proprietary - published RFI and
 * blind-defence ranges of the kind every solver output and training site
 * agrees on - and the ground truth the range-action grader scores against.
 */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Generate hand name for a grid cell.
 * row = first rank index, col = second rank index
 * diagonal = pair (AA, KK), above diagonal = suited (AKs), below = offsuit (AKo)
 */
export function getHandName(row, col) {
  if (row === col) return RANKS[row] + RANKS[col];
  if (col > row) return RANKS[row] + RANKS[col] + 's';
  return RANKS[col] + RANKS[row] + 'o';
}

/**
 * Build a 169-hand range. Actions can be:
 * - string arrays: raises[], calls[] → pure 100% actions
 * - mixed[]: array of { hand, raise, call } objects with frequencies (0-100)
 */
function buildRange(raises = [], calls = [], mixed = []) {
  const range = {};
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      range[getHandName(r, c)] = 'fold';
    }
  }
  raises.forEach(h => { range[h] = 'raise'; });
  calls.forEach(h => { range[h] = 'call'; });
  mixed.forEach(m => {
    if (typeof m === 'string') {
      range[m] = 'mixed';
    } else {
      // { hand: 'AJs', raise: 60, call: 40 }
      range[m.hand] = { raise: m.raise || 0, call: m.call || 0, fold: m.fold || 0 };
    }
  });
  return range;
}

/**
 * Helper to get the primary action from a range entry.
 * Supports both string ('raise') and object ({ raise: 70, call: 30 }) formats.
 */
export function getAction(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry) return 'fold';
  // Return the action with highest frequency
  const { raise = 0, call = 0, fold = 0 } = entry;
  if (raise >= call && raise >= fold) return 'raise';
  if (call >= raise && call >= fold) return 'call';
  return 'fold';
}

export function isFreqMixed(entry) {
  return typeof entry === 'object' && entry !== null;
}

export function getFrequencies(entry) {
  if (typeof entry === 'string') {
    if (entry === 'raise') return { raise: 100, call: 0, fold: 0 };
    if (entry === 'call') return { raise: 0, call: 100, fold: 0 };
    if (entry === 'mixed') return { raise: 50, call: 50, fold: 0 };
    return { raise: 0, call: 0, fold: 100 };
  }
  return { raise: entry.raise || 0, call: entry.call || 0, fold: entry.fold || 0 };
}

// All pairs as array
const allPairs = RANKS.map(r => r + r);
// Helper to make suited combos: e.g. suitedRange('A', 'K', 'T') => ['AKs','AQs','AJs','ATs']
function suitedRange(high, from, to) {
  const hi = RANKS.indexOf(high);
  const start = RANKS.indexOf(from);
  const end = RANKS.indexOf(to);
  const hands = [];
  for (let i = start; i <= end; i++) {
    hands.push(RANKS[hi] + RANKS[i] + 's');
  }
  return hands;
}
function offsuitRange(high, from, to) {
  const hi = RANKS.indexOf(high);
  const start = RANKS.indexOf(from);
  const end = RANKS.indexOf(to);
  const hands = [];
  for (let i = start; i <= end; i++) {
    hands.push(RANKS[hi] + RANKS[i] + 'o');
  }
  return hands;
}
function pairRange(from, to) {
  const start = RANKS.indexOf(from);
  const end = RANKS.indexOf(to);
  const hands = [];
  for (let i = start; i <= end; i++) {
    hands.push(RANKS[i] + RANKS[i]);
  }
  return hands;
}

// ============================================================
// UTG RFI (~15%): AA-22, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo
// ============================================================
const UTG_RFI = buildRange(
  [
    ...pairRange('A', '6'),
    ...suitedRange('A', 'K', 'T'),
    'KQs', 'KJs',
    'QJs', 'JTs',
    ...offsuitRange('A', 'K', 'J'),
    'KQo',
  ],
  [],
  [
    { hand: '55', raise: 80, fold: 20 },
    { hand: '44', raise: 65, fold: 35 },
    { hand: '33', raise: 50, fold: 50 },
    { hand: '22', raise: 40, fold: 60 },
    { hand: 'A9s', raise: 45, fold: 55 },
    { hand: 'KTs', raise: 55, fold: 45 },
    { hand: 'QTs', raise: 35, fold: 65 },
    { hand: 'T9s', raise: 30, fold: 70 },
    { hand: 'ATo', raise: 40, fold: 60 },
  ]
);

// ============================================================
// HJ RFI (~20%): UTG + A9s, KTs, QTs, T9s, 98s, ATo
// ============================================================
const HJ_RFI = buildRange(
  [
    ...pairRange('A', '4'),
    ...suitedRange('A', 'K', '9'),
    ...suitedRange('K', 'Q', 'T'),
    'QJs', 'QTs', 'JTs', 'J9s', 'T9s', '98s',
    ...offsuitRange('A', 'K', 'T'),
    'KQo',
  ],
  [],
  [
    { hand: '33', raise: 75, fold: 25 },
    { hand: '22', raise: 60, fold: 40 },
    { hand: 'A8s', raise: 55, fold: 45 },
    { hand: 'K9s', raise: 50, fold: 50 },
    { hand: '87s', raise: 45, fold: 55 },
    { hand: 'T8s', raise: 40, fold: 60 },
    { hand: 'A9o', raise: 35, fold: 65 },
    { hand: 'KJo', raise: 50, fold: 50 },
  ]
);

// ============================================================
// CO RFI (~28%): HJ + A8s-A2s, K9s, Q9s, J9s, T8s, 87s, 76s, KJo, QJo
// ============================================================
const CO_RFI = buildRange(
  [
    ...pairRange('A', '2'),
    ...suitedRange('A', 'K', '2'),
    ...suitedRange('K', 'Q', '9'),
    ...suitedRange('Q', 'J', '9'),
    'JTs', 'J9s', 'T9s', 'T8s', '98s', '97s', '87s', '76s',
    ...offsuitRange('A', 'K', 'T'),
    'KQo', 'KJo', 'QJo',
  ],
  [],
  [
    { hand: 'K8s', raise: 55, fold: 45 },
    { hand: 'Q8s', raise: 40, fold: 60 },
    { hand: 'J8s', raise: 45, fold: 55 },
    { hand: '86s', raise: 50, fold: 50 },
    { hand: '65s', raise: 55, fold: 45 },
    { hand: '54s', raise: 45, fold: 55 },
    { hand: 'A9o', raise: 60, fold: 40 },
    { hand: 'KTo', raise: 55, fold: 45 },
    { hand: 'QTo', raise: 35, fold: 65 },
    { hand: 'JTo', raise: 30, fold: 70 },
  ]
);

// ============================================================
// BTN RFI (~45%): CO + K8s-K2s, Q8s-Q2s, J8s, T7s, 97s, 86s, 75s, 65s, 54s,
//                 KTo, QTo, JTo, A9o-A2o
// ============================================================
const BTN_RFI = buildRange(
  [
    ...pairRange('A', '2'),
    ...suitedRange('A', 'K', '2'),
    ...suitedRange('K', 'Q', '2'),
    ...suitedRange('Q', 'J', '2'),
    ...suitedRange('J', 'T', '8'),
    'T9s', 'T8s', 'T7s',
    '98s', '97s', '96s',
    '87s', '86s', '85s',
    '76s', '75s',
    '65s', '64s',
    '54s', '53s',
    '43s',
    ...offsuitRange('A', 'K', '2'),
    ...offsuitRange('K', 'Q', 'T'),
    'QJo', 'QTo',
    'JTo', 'J9o',
    'T9o',
  ]
);

// ============================================================
// SB RFI (~40%): Similar to BTN but slightly tighter
// ============================================================
const SB_RFI = buildRange(
  [
    ...pairRange('A', '2'),
    ...suitedRange('A', 'K', '2'),
    ...suitedRange('K', 'Q', '2'),
    ...suitedRange('Q', 'J', '3'),
    ...suitedRange('J', 'T', '8'),
    'T9s', 'T8s', 'T7s',
    '98s', '97s',
    '87s', '86s',
    '76s', '75s',
    '65s', '64s',
    '54s',
    ...offsuitRange('A', 'K', '2'),
    ...offsuitRange('K', 'Q', 'T'),
    'QJo', 'QTo',
    'JTo',
    'T9o',
  ]
);

// ============================================================
// BB vsUTG: 3-bet (raise): QQ+, AKs, AKo. Call: JJ-88, AQs-ATs, KQs, AQo. Fold: rest
// ============================================================
const BB_vsUTG = buildRange(
  // raise (3-bet)
  [
    ...pairRange('A', 'Q'),
    'AKs',
    'AKo',
  ],
  // call
  [
    ...pairRange('J', '4'),
    ...suitedRange('A', 'Q', 'T'),
    'KQs', 'KJs', 'QJs', 'JTs', 'T9s', '98s', '87s', '76s',
    'AQo', 'AJo',
  ],
  [
    { hand: 'JJ', raise: 45, call: 55 },
    { hand: 'TT', raise: 30, call: 70 },
    { hand: 'AQs', raise: 40, call: 60 },
    { hand: '33', call: 60, fold: 40 },
    { hand: '22', call: 45, fold: 55 },
    { hand: 'A9s', call: 55, fold: 45 },
    { hand: 'KTs', call: 60, fold: 40 },
    { hand: 'QTs', call: 45, fold: 55 },
    { hand: '65s', call: 50, fold: 50 },
    { hand: 'ATo', call: 40, fold: 60 },
    { hand: 'KQo', call: 55, fold: 45 },
  ]
);

// ============================================================
// BB vsBTN: Much wider defense
// 3-bet: TT+, AQs+, AKo
// Call: 99-22, A9s-A2s, KJs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s, 76s, 65s,
//       AJo-ATo, KQo-KJo
// ============================================================
const BB_vsBTN = buildRange(
  // raise (3-bet)
  [
    ...pairRange('A', 'J'),
    'AKs', 'AQs',
    'AKo',
  ],
  // call
  [
    ...pairRange('9', '3'),
    ...suitedRange('A', 'J', '2'),
    ...suitedRange('K', 'Q', '9'),
    ...suitedRange('Q', 'J', '9'),
    'JTs', 'J9s',
    'T9s', 'T8s',
    '98s', '97s',
    '87s', '86s',
    '76s', '75s',
    '65s',
    '54s',
    ...offsuitRange('A', 'J', '8'),
    'KQo', 'KJo', 'KTo',
    'QJo', 'QTo',
    'JTo',
    'T9o',
  ],
  [
    { hand: 'TT', raise: 55, call: 45 },
    { hand: '99', raise: 35, call: 65 },
    { hand: 'AJs', raise: 55, call: 45 },
    { hand: 'ATs', raise: 40, call: 60 },
    { hand: 'A5s', raise: 60, fold: 40 },
    { hand: 'A4s', raise: 50, fold: 50 },
    { hand: 'KQs', raise: 45, call: 55 },
    { hand: 'KJs', raise: 35, call: 65 },
    { hand: 'AQo', raise: 55, call: 45 },
    { hand: '22', call: 55, fold: 45 },
    { hand: 'K8s', call: 60, fold: 40 },
    { hand: 'Q8s', call: 45, fold: 55 },
    { hand: 'J8s', call: 50, fold: 50 },
    { hand: '96s', call: 40, fold: 60 },
    { hand: '85s', call: 45, fold: 55 },
    { hand: '74s', call: 35, fold: 65 },
    { hand: '64s', call: 40, fold: 60 },
    { hand: '53s', call: 35, fold: 65 },
    { hand: 'A7o', call: 45, fold: 55 },
    { hand: 'K9o', call: 40, fold: 60 },
    { hand: 'Q9o', call: 30, fold: 70 },
    { hand: 'J9o', call: 35, fold: 65 },
    { hand: 'T8o', call: 25, fold: 75 },
    { hand: '98o', call: 30, fold: 70 },
  ]
);

export const RANGES = {
  UTG: { RFI: UTG_RFI },
  HJ: { RFI: HJ_RFI },
  CO: { RFI: CO_RFI },
  BTN: { RFI: BTN_RFI },
  SB: { RFI: SB_RFI },
  BB: { vsUTG: BB_vsUTG, vsBTN: BB_vsBTN },
};

export const POSITIONS = [
  { id: 'UTG', name: 'Under the Gun', short: 'UTG', description: 'First to act, tightest range', pct: 15 },
  { id: 'HJ', name: 'Hijack', short: 'HJ', description: 'Second position, slightly wider', pct: 20 },
  { id: 'CO', name: 'Cutoff', short: 'CO', description: 'One before the button, wider range', pct: 28 },
  { id: 'BTN', name: 'Button', short: 'BTN', description: 'Best position, widest open range', pct: 45 },
  { id: 'SB', name: 'Small Blind', short: 'SB', description: 'Must act first postflop, raise or fold', pct: 40 },
  { id: 'BB', name: 'Big Blind', short: 'BB', description: 'Already invested, defend wider', pct: 35 },
];

export const SCENARIOS = {
  UTG: ['RFI'],
  HJ: ['RFI'],
  CO: ['RFI'],
  BTN: ['RFI'],
  SB: ['RFI'],
  BB: ['vsUTG', 'vsBTN'],
};

export const SCENARIO_LABELS = {
  RFI: 'Raise First In',
  vsUTG: 'vs UTG Open',
  vsBTN: 'vs BTN Open',
};
