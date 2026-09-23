/**
 * The oracle as tools a model can call: what each tool is, what it takes, and
 * what it returns. No MCP here - server.js puts these on the wire - so every
 * tool is a plain function that can be tested and reasoned about on its own.
 *
 * Three things shape the whole file.
 *
 * The descriptions are a prompt. A model reads them before deciding whether
 * to call at all, so each one says what the tool does *and when to reach for
 * it*. "Use this instead of estimating by hand" is the sentence that turns a
 * model from guessing into calling; the unaided runs showed that a guess is
 * what you otherwise get, and gpt-4o-mini's guesses were off by 17pp on
 * average.
 *
 * Every refusal says what would have worked. A model can repair "unknown
 * position 'LJ'; valid: UTG, HJ, CO, BTN, SB, BB" in one step; "invalid
 * input" costs it a turn and usually a second wrong guess.
 *
 * Results are small. Every field is paid for, in tokens, on every call.
 *
 * The one place the tools deliberately differ from the eval: past the
 * enumeration cap, the eval's enumerateEquity throws, because a case file
 * marked exact must be exact. A tool that refuses to answer is useless, so
 * poker_equity goes through equity(), which samples instead - and says so,
 * with `exact: false`, so an agent can tell a computed answer from an
 * estimate.
 */
import { equity } from '../oracle/equity.js';
import { calculateICM } from '../oracle/icm.js';
import { RANGES, SCENARIOS, getAction, getFrequencies } from '../oracle/ranges.js';
import { VARIANTS, variantFor } from '../oracle/variants.js';

export const VARIANT_IDS = Object.keys(VARIANTS);

export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const SCENARIO_IDS = ['RFI', 'vsUTG', 'vsBTN'];

/** ICM recurses over every finishing order it pays for; past this it stops being instant. */
const MAX_SEATS = 10;

/** A refusal the model will read. Thrown by a tool, returned by the server as isError. */
export class ToolInputError extends Error {}

const refuse = (message) => {
  throw new ToolInputError(message);
};

/** Reject a value the tool cannot use, naming the argument and what was expected. */
function check(ok, message) {
  if (!ok) refuse(message);
}

const isNumberArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));

export const TOOLS = [
  {
    name: 'poker_equity',
    description:
      "Computes a poker hand's equity: the share of the pot it wins on average, counting a split pot as a share. " +
      "Covers Texas Hold'em, pot-limit Omaha with four, five or six cards, short-deck (6+) Hold'em, and Omaha Hi-Lo eight-or-better. " +
      'Use this instead of estimating by hand - equity worked out mentally is unreliable, and each variant has rules that trip up a Hold\'em habit. ' +
      'Every remaining board is enumerated when that is feasible (exact: true); otherwise a seeded sample is drawn and the result says exact: false.',
    inputSchema: {
      type: 'object',
      properties: {
        hero: { type: 'string', description: 'Hero\'s hole cards: rank (23456789TJQKA) then suit (cdhs), e.g. "AcAd" or "Ah Kh". Two cards for Hold\'em, four to six for Omaha.' },
        board: { type: 'string', description: 'Community cards so far: 0, 3, 4 or 5 of them, e.g. "2c 7d 9h". Omit preflop.' },
        opponents: { type: 'array', items: { type: 'string' }, description: 'Known opponent hands, one string each, e.g. ["KcKd"].' },
        num_opponents: { type: 'integer', minimum: 0, description: 'Opponents whose cards are unknown; dealt at random. Can be combined with opponents.' },
        variant: { type: 'string', enum: VARIANT_IDS, description: 'The game. Defaults to holdem. Omaha needs four (plo), five (plo5) or six (plo6) hole cards; shortdeck uses a 36-card deck; omaha-hi-lo splits the pot with the best qualifying low.' },
        seed: { type: 'integer', description: 'Seed for sampling, to reproduce an estimate. Has no effect when the answer is exact.' },
      },
      required: ['hero'],
      additionalProperties: false,
    },
    run(args) {
      const { hero, board = '', opponents = [], num_opponents: numOpponents = 0, seed, variant: variantId = 'holdem' } = args;
      let variant;
      try {
        variant = variantFor(variantId);
      } catch (e) {
        refuse(e.message);
      }
      check(typeof hero === 'string' && hero.trim(), `hero is required: ${variant.holeCards} hole cards, e.g. "AcAd".`);
      check(typeof board === 'string', 'board must be a string of 0, 3, 4 or 5 cards, e.g. "2c 7d 9h".');
      check(Array.isArray(opponents) && opponents.every((o) => typeof o === 'string'), 'opponents must be a list of hands, e.g. ["KcKd"].');
      check(Number.isInteger(numOpponents) && numOpponents >= 0, 'num_opponents must be a whole number, 0 or more.');
      check(seed === undefined || Number.isInteger(seed), 'seed must be a whole number.');
      check(opponents.length + numOpponents >= 1, 'give at least one opponent: known hands in opponents, or a count in num_opponents.');

      let r;
      try {
        r = equity({ hero, board, opponents, numOpponents, variant: variant.id, ...(seed !== undefined ? { seed } : {}) });
      } catch (e) {
        // The oracle's own messages already name the problem: "bad card: Xd",
        // "duplicate card in ...", "hero needs exactly 4 cards in Pot-limit
        // Omaha", "2c is not in the Short-deck Hold'em (6+) deck".
        refuse(e.message);
      }
      return {
        equity: r.equity,
        equity_pct: r.equity * 100,
        method: r.method,
        exact: r.exact,
        samples: r.samples,
        // Echoed so an agent can see which game answered, and catch its own
        // mistake when it meant to ask about another one.
        variant: variant.id,
        ...(r.exact ? {} : { seed: r.seed }),
      };
    },
  },
  {
    name: 'poker_icm',
    description:
      'Computes each player\'s ICM equity in a poker tournament (Malmuth-Harville): what their chip stack is worth in prize money. ' +
      'Use this instead of estimating by hand - ICM is not proportional to chips, and a chip-proportional guess overpays big stacks. ' +
      'Returns one value per seat, in stack order, and whether they add up to the prize pool.',
    inputSchema: {
      type: 'object',
      properties: {
        stacks: { type: 'array', items: { type: 'number', exclusiveMinimum: 0 }, description: 'Chip stacks, one per player, in seat order.' },
        payouts: { type: 'array', items: { type: 'number', minimum: 0 }, description: 'Prizes, first place first.' },
      },
      required: ['stacks', 'payouts'],
      additionalProperties: false,
    },
    run({ stacks, payouts }) {
      check(isNumberArray(stacks) && stacks.length > 0 && stacks.every((s) => s > 0), 'stacks must be a list of positive chip counts, one per player, e.g. [5000, 3000, 2000].');
      check(isNumberArray(payouts) && payouts.length > 0 && payouts.every((p) => p >= 0), 'payouts must be a list of prizes, first place first, e.g. [500, 300, 200].');
      check(stacks.length <= MAX_SEATS, `stacks has ${stacks.length} players; this tool handles up to ${MAX_SEATS}.`);
      const equities = calculateICM(stacks, payouts);
      const pool = payouts.reduce((a, b) => a + b, 0);
      const paid = equities.reduce((a, b) => a + b, 0);
      return {
        equities,
        pool,
        // False only when there are fewer players than paid places: the lower
        // places are never reached, so that money is never paid out.
        sums_to_pool: Math.abs(paid - pool) <= 1e-9 * Math.max(1, pool),
      };
    },
  },
  {
    name: 'poker_range_action',
    description:
      'Looks up the preflop action for a hand in a 100bb six-max cash game, from solver-approximate charts: raise, call or fold, with the chart\'s frequencies. ' +
      'Use this rather than recalling ranges from memory. Charts cover opening (RFI) from UTG, HJ, CO, BTN and SB, and big blind defence (vsUTG, vsBTN).',
    inputSchema: {
      type: 'object',
      properties: {
        hand: { type: 'string', description: 'Hand class: a pair ("QQ"), or two ranks plus s (suited) or o (offsuit), e.g. "A5s", "72o".' },
        position: { type: 'string', enum: POSITIONS, description: 'Your seat.' },
        scenario: { type: 'string', enum: SCENARIO_IDS, description: 'RFI: first to raise. vsUTG / vsBTN: big blind facing a raise from that seat.' },
      },
      required: ['hand', 'position', 'scenario'],
      additionalProperties: false,
    },
    run({ hand, position, scenario }) {
      check(POSITIONS.includes(position), `unknown position ${JSON.stringify(position)}; valid: ${POSITIONS.join(', ')}.`);
      check(SCENARIO_IDS.includes(scenario), `unknown scenario ${JSON.stringify(scenario)}; valid: ${SCENARIO_IDS.join(', ')}.`);
      const offered = SCENARIOS[position];
      check(offered.includes(scenario), `no ${scenario} chart for ${position}; ${position} has: ${offered.join(', ')}.`);
      const name = handClass(hand);
      check(name, `cannot read hand ${JSON.stringify(hand)}; give a hand class such as "AKs", "A5s", "72o" or "QQ", not specific cards.`);
      const entry = RANGES[position][scenario][name];
      const frequencies = getFrequencies(entry);
      return {
        action: getAction(entry),
        frequencies,
        mixed: Object.values(frequencies).filter((f) => f > 0).length > 1,
        position,
        scenario,
      };
    },
  },
];

const RANK_ORDER = 'AKQJT98765432';

/**
 * "aks", "KAs" and "AKs" all mean the same hand, so all three are accepted.
 * Specific cards ("AcKd") are not: which class they belong to is a step the
 * model should see itself take, and the refusal says how.
 */
export function handClass(input) {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(/^([2-9TJQKA])([2-9TJQKA])([so])?$/i);
  if (!m) return null;
  let [a, b] = [m[1].toUpperCase(), m[2].toUpperCase()];
  const suit = m[3]?.toLowerCase();
  if (a === b) return suit ? null : a + b;
  if (!suit) return null;
  if (RANK_ORDER.indexOf(a) > RANK_ORDER.indexOf(b)) [a, b] = [b, a];
  return a + b + suit;
}

/**
 * Run a tool by name. Returns { value } or { error }, never throws for bad
 * input: the server turns an error into a result the model can read.
 */
export function callTool(name, args = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `unknown tool ${JSON.stringify(name)}; available: ${TOOLS.map((t) => t.name).join(', ')}.` };
  // An argument the tool does not know would otherwise be dropped silently:
  // "numOpponents" for "num_opponents" would run with no unknown opponents.
  const known = Object.keys(tool.inputSchema.properties);
  const unknown = Object.keys(args ?? {}).filter((k) => !known.includes(k));
  if (unknown.length) {
    return { error: `unknown argument ${unknown.map((k) => JSON.stringify(k)).join(', ')} for ${name}; valid: ${known.join(', ')}.` };
  }
  try {
    return { value: tool.run(args ?? {}) };
  } catch (e) {
    if (e instanceof ToolInputError) return { error: e.message };
    // Anything else is a bug in the server, not the caller's input.
    throw e;
  }
}
