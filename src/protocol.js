/**
 * The contract between the harness and the model: how a case becomes a prompt,
 * and how a reply becomes a value the graders can score.
 *
 * Parsing is deliberately two-tier. The prompt asks for one JSON object and
 * nothing else, and `parseAnswer` tries that first; if it fails it falls back
 * to pulling a number or a word out of prose. The fallback exists because
 * models do ramble and throwing the case away would hide a real answer - but
 * every recovery is recorded, so "how often did it ignore the output contract"
 * is itself a reported metric rather than something quietly papered over.
 */

/** One line of instruction shared by every task, so the contract is identical. */
const CONTRACT =
  'Reply with exactly one JSON object and no other text, no markdown fence, and no explanation.';

export function buildPrompt(kase) {
  switch (kase.type) {
    case 'equity': {
      const board = kase.board && kase.board.length ? kase.board : 'none (preflop)';
      const opp = kase.opponents && kase.opponents.length
        ? `known opponent hands: ${kase.opponents.join(', ')}`
        : `${kase.numOpponents} opponent(s) with unknown hole cards`;
      return [
        'You are computing Texas Hold\'em equity.',
        '',
        `Hero hole cards: ${kase.hero}`,
        `Board: ${board}`,
        opp,
        '',
        'Give hero\'s equity: the share of the pot hero wins on average, counting',
        'a split pot as a half. Express it as a percentage from 0 to 100.',
        '',
        CONTRACT,
        'Schema: {"equity_pct": <number>}',
      ].join('\n');
    }
    case 'icm': {
      return [
        'You are computing ICM equity for a poker tournament using the',
        'Malmuth-Harville model.',
        '',
        `Chip stacks, in seat order: ${kase.stacks.join(', ')}`,
        `Payouts, first place first: ${kase.payouts.join(', ')}`,
        '',
        'Give each seat\'s ICM equity in the same currency as the payouts, in the',
        'same seat order as the stacks.',
        '',
        CONTRACT,
        `Schema: {"icm": [<number> x ${kase.stacks.length}]}`,
      ].join('\n');
    }
    case 'range': {
      return [
        'You are playing a 100 big blind six-max cash game with standard',
        'solver-approximate preflop ranges.',
        '',
        `Position: ${kase.position}`,
        `Situation: ${kase.scenarioLabel}`,
        `Your hand: ${kase.hand}`,
        '',
        'Choose the action this hand takes in that spot.',
        '',
        CONTRACT,
        'Schema: {"action": "raise" | "call" | "fold"}',
      ].join('\n');
    }
    default:
      throw new Error(`no prompt for case type ${kase.type}`);
  }
}

/** The first balanced {...} block in a string, or null. */
function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const NUMBER = /-?\d+(?:\.\d+)?/;

/**
 * Turn a raw reply into `{ value, recovered, raw }`, or `{ error }` when even
 * the fallback cannot find an answer. `recovered` means the JSON contract was
 * not honoured and the value came out of prose instead.
 */
export function parseAnswer(kase, text) {
  const raw = String(text ?? '');
  const block = firstJsonObject(raw);
  if (block) {
    try {
      const obj = JSON.parse(block);
      const value = fromObject(kase, obj);
      if (value !== undefined) return { value, recovered: false, raw };
    } catch {
      // fall through to the prose reader
    }
  }
  const value = fromProse(kase, raw);
  if (value !== undefined) return { value, recovered: true, raw };
  return { error: 'no answer found in reply', raw };
}

function fromObject(kase, obj) {
  if (kase.type === 'equity') {
    const n = obj.equity_pct ?? obj.equity ?? obj.equityPct;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  }
  if (kase.type === 'icm') {
    const a = obj.icm ?? obj.equities ?? obj.values;
    if (!Array.isArray(a) || a.length !== kase.stacks.length) return undefined;
    return a.every((n) => typeof n === 'number' && Number.isFinite(n)) ? a : undefined;
  }
  if (kase.type === 'range') {
    const s = obj.action ?? obj.decision;
    if (typeof s !== 'string') return undefined;
    const norm = s.trim().toLowerCase();
    return ['raise', 'call', 'fold'].includes(norm) ? norm : undefined;
  }
  return undefined;
}

function fromProse(kase, raw) {
  if (kase.type === 'equity') {
    // Prefer a number attached to a percent sign, which is almost always the
    // answer rather than a stray count of outs.
    const pct = raw.match(new RegExp(`(${NUMBER.source})\\s*%`));
    if (pct) return Number(pct[1]);
    const any = raw.match(NUMBER);
    return any ? Number(any[0]) : undefined;
  }
  if (kase.type === 'icm') {
    const all = raw.match(new RegExp(NUMBER.source, 'g')) ?? [];
    const nums = all.map(Number).filter((n) => Number.isFinite(n));
    // Only trust prose here when the count matches exactly: picking the "right"
    // subset of a longer list would be guessing.
    return nums.length === kase.stacks.length ? nums : undefined;
  }
  if (kase.type === 'range') {
    const m = raw.toLowerCase().match(/\b(raise|call|fold)\b/);
    return m ? m[1] : undefined;
  }
  return undefined;
}
