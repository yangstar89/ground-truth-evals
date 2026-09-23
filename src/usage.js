/**
 * What a run cost to produce, in tokens.
 *
 * Every provider names these fields differently, and a run file keeps whatever
 * the provider sent. Normalising here means a report can say what a run cost
 * without the rest of the harness knowing which API answered.
 *
 * Tokens rather than money: prices change, and a number in a committed
 * document that silently goes stale is worse than no number. `priceRun` turns
 * tokens into money only when the caller supplies a price list, so the rate
 * used is always visible next to the figure.
 */

/** One reply's usage, as { input, output }. Unknown shapes count as nothing. */
export function normaliseUsage(usage) {
  if (!usage || typeof usage !== 'object') return { input: 0, output: 0 };
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    // Cached input is still input: a with-tools run resends the tool
    // definitions on every call, and leaving that out would make it look
    // cheaper than it was.
    input: n(usage.prompt_tokens) + n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens),
    output: n(usage.completion_tokens) + n(usage.output_tokens),
  };
}

/** Totals across a run's rows, plus how many of them reported usage at all. */
export function sumUsage(rows) {
  let input = 0;
  let output = 0;
  let counted = 0;
  for (const r of rows) {
    if (!r?.usage) continue;
    const u = normaliseUsage(r.usage);
    input += u.input;
    output += u.output;
    counted++;
  }
  return { input, output, replies: counted };
}

/**
 * Money, from a price list in dollars per million tokens:
 *
 *   { "openai:gpt-4o-mini": { "input": 0.15, "output": 0.6 } }
 *
 * Returns null when the model is not listed, so a missing price shows as a
 * blank rather than as a free run.
 */
export function priceRun(usage, prices, model) {
  const key = model?.replace(/\+tools$/, '');
  const p = prices?.[model] ?? prices?.[key];
  if (!p || !usage) return null;
  const input = (usage.input / 1e6) * (p.input ?? 0);
  const output = (usage.output / 1e6) * (p.output ?? 0);
  return input + output;
}

/** "1.2M" / "154k" / "820": token counts at a glance. */
export function formatTokens(n) {
  if (!Number.isFinite(n)) return '-';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
