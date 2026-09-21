/**
 * Loads `.env` into `process.env`, with no dependency.
 *
 * The README tells you to copy `.env.example` to `.env` and fill it in, so
 * something has to read it; without this the documented flow fails with
 * "OPENAI_API_KEY is not set" even when the file is right there, which is a
 * miserable thing to debug.
 *
 * A real environment variable always wins over the file. That ordering is what
 * lets a one-off `OPENAI_API_KEY=... node bin/eval.mjs` override a stored key
 * without editing anything, and it is the convention every other loader uses.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Parse the .env format: comments, blanks, optional quotes, optional `export`. */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq < 1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      // An unquoted trailing comment is not part of the value.
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Read the first file that exists and fill in anything not already set.
 * Returns the names of the keys it supplied - never the values.
 */
export function loadEnv({ files = ['.env.local', '.env'], cwd = process.cwd() } = {}) {
  const applied = [];
  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    const parsed = parseEnv(readFileSync(path, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined && v !== '') {
        process.env[k] = v;
        applied.push(k);
      }
    }
  }
  return applied;
}
