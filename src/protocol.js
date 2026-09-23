/**
 * The contract between the harness and the model: how a case becomes a prompt,
 * and how a reply becomes a value the graders can score. What a prompt says
 * and what a reply means belong to the suite; the machinery here is the same
 * whatever the domain.
 *
 * Parsing is deliberately two-tier. The prompt asks for one JSON object and
 * nothing else, and `parseAnswer` tries that first; if it fails it falls back
 * to the suite's prose reader. The fallback exists because models do ramble
 * and throwing the case away would hide a real answer - but every recovery is
 * recorded, so "how often did it ignore the output contract" is itself a
 * reported metric rather than something quietly papered over.
 */
import { taskFor } from './suite.js';

/** One line of instruction shared by every task, so the contract is identical. */
export const CONTRACT =
  'Reply with exactly one JSON object and no other text, no markdown fence, and no explanation.';

export function buildPrompt(suite, kase) {
  return taskFor(suite, kase).prompt(kase);
}

/** The first balanced {...} block in a string, or null. */
export function firstJsonObject(text) {
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

/** A number as models write them, for suites reading values out of prose. */
export const NUMBER = /-?\d+(?:\.\d+)?/;

/**
 * Turn a raw reply into `{ value, recovered, raw }`, or `{ error }` when even
 * the fallback cannot find an answer. `recovered` means the JSON contract was
 * not honoured: either the value came out of prose, or the object used a field
 * the schema did not ask for.
 */
export function parseAnswer(suite, kase, text) {
  const task = taskFor(suite, kase);
  const raw = String(text ?? '');
  const block = firstJsonObject(raw);
  if (block) {
    try {
      const obj = JSON.parse(block);
      const value = task.fromObject?.(kase, obj);
      if (value !== undefined) return { value, recovered: false, raw };
      // A value under a field the schema did not ask for still counts as an
      // answer, and still counts as having ignored the schema.
      const offSchema = task.fromOffSchemaObject?.(kase, obj);
      if (offSchema !== undefined) return { value: offSchema, recovered: true, raw };
    } catch {
      // fall through to the prose reader
    }
  }
  const value = task.fromProse?.(kase, raw);
  if (value !== undefined) return { value, recovered: true, raw };
  return { error: 'no answer found in reply', raw };
}
