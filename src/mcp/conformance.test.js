/**
 * What the MCP server must do, as tests. Written before the server, so the
 * server is done when this file passes.
 *
 * The server lives at SERVER below and speaks MCP over stdio. It exposes the
 * oracle as three tools, and every tool result is one text block holding a
 * JSON object:
 *
 *   equity        { hero, board?, opponents?, numOpponents? }
 *                 -> { equity_pct, method, exact }
 *                 hero "AcAd"; board "2c 7d 9h" or "" preflop; opponents a
 *                 list of known hands, numOpponents a count of unknown ones.
 *   icm           { stacks, payouts } -> { icm: [one value per seat] }
 *   range_action  { hand, position, scenario } -> { action, frequencies }
 *                 hand "AKs"; position "BTN"; scenario "RFI" or "vsUTG".
 *
 * Bad input - a duplicate card, an unknown position - comes back as a tool
 * error (isError), never as a crash, because the model reads that error and
 * gets to try again.
 *
 * Every case in cases/v1.jsonl is pushed through the real server over real
 * MCP, and the answer must match the frozen ground truth. That is the whole
 * claim the with-tools run rests on: if the tools answer correctly, what the
 * run measures is whether the model can use them.
 *
 * Until the server exists this suite is skipped, visibly, rather than failed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { connectTools } from '../runners/tools.js';

const SERVER = 'bin/mcp-server.mjs';

const cases = readFileSync('cases/v1.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ofType = (t) => cases.filter((c) => c.type === t);

describe.skipIf(!existsSync(SERVER))(`MCP server conformance (${SERVER})`, () => {
  let conn;
  beforeAll(async () => {
    conn = await connectTools(`node ${SERVER}`);
  }, 30000);
  afterAll(async () => {
    await conn?.close();
  });

  /** Call a tool and read its JSON result, failing loudly if it is not JSON. */
  async function ask(name, args) {
    const res = await conn.call(name, args);
    if (res.isError) return res;
    let value;
    try {
      value = JSON.parse(res.text);
    } catch {
      throw new Error(`${name} returned text that is not JSON: ${res.text.slice(0, 200)}`);
    }
    return { ...res, value };
  }

  it('offers exactly equity, icm and range_action, each described and with an object schema', () => {
    expect(conn.tools.map((t) => t.name).sort()).toEqual(['equity', 'icm', 'range_action']);
    for (const t of conn.tools) {
      // The description and schema are all a model has to go on.
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema?.type).toBe('object');
    }
  });

  it('reproduces the ground truth of every equity case', async () => {
    for (const k of ofType('equity')) {
      const res = await ask('equity', {
        hero: k.hero,
        board: k.board ?? '',
        ...(k.opponents?.length ? { opponents: k.opponents } : {}),
        ...(k.numOpponents ? { numOpponents: k.numOpponents } : {}),
      });
      expect(res.isError, `${k.id}: ${res.text}`).toBe(false);
      // Exact means exact. A sampled truth was frozen at one seed and sample
      // count, so the server's own sample may differ - by far less than the
      // 2.5pp a model is allowed.
      const allowed = k.exact ? 1e-6 : 1;
      expect(Math.abs(res.value.equity_pct - k.expected * 100), k.id).toBeLessThanOrEqual(allowed);
      expect(res.value.exact, `${k.id} must say whether it enumerated`).toBe(k.exact);
    }
  }, 120000);

  it('reproduces the ground truth of every icm case', async () => {
    for (const k of ofType('icm')) {
      const res = await ask('icm', { stacks: k.stacks, payouts: k.payouts });
      expect(res.isError, `${k.id}: ${res.text}`).toBe(false);
      expect(res.value.icm).toHaveLength(k.expected.length);
      res.value.icm.forEach((v, i) => expect(Math.abs(v - k.expected[i]), `${k.id} seat ${i + 1}`).toBeLessThan(0.01));
    }
  });

  it('reproduces the chart for every range case, frequencies included', async () => {
    for (const k of ofType('range')) {
      const res = await ask('range_action', { hand: k.hand, position: k.position, scenario: k.scenario });
      expect(res.isError, `${k.id}: ${res.text}`).toBe(false);
      expect(res.value.action, k.id).toBe(k.expected);
      expect(res.value.frequencies, k.id).toEqual(k.frequencies);
    }
  });

  it('answers bad input with a tool error the model can read, and keeps serving', async () => {
    const dup = await conn.call('equity', { hero: 'AcAd', opponents: ['AcKd'] });
    expect(dup.isError).toBe(true);
    expect(dup.text).toMatch(/duplicate/i);

    const where = await conn.call('range_action', { hand: 'AKs', position: 'UTG+7', scenario: 'RFI' });
    expect(where.isError).toBe(true);

    // Still alive after both.
    const ok = await ask('icm', { stacks: [1, 1], payouts: [60, 40] });
    expect(ok.value.icm).toEqual([50, 50]);
  });
});
