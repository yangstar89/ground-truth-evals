/**
 * What the MCP server must do, as tests. Written before the server, so the
 * server is done when this file passes.
 *
 * The server lives at SERVER below and speaks MCP over stdio. It exposes the
 * oracle as three tools; every result is one text block holding a JSON object,
 * kept small, because every field costs tokens on every call.
 *
 *   poker_equity        { hero, board?, opponents?, num_opponents?, seed? }
 *                       -> { equity, equity_pct, method, exact, samples, seed? }
 *                       Enumerates when the space is small enough, samples
 *                       when not, and says which. Unlike the eval, which
 *                       must never pass an estimate off as exact, a tool that
 *                       refuses to answer is useless - so it samples and
 *                       reports exact: false.
 *   poker_icm           { stacks, payouts } -> { equities, pool, sums_to_pool }
 *                       sums_to_pool is the constraint gpt-4o-mini broke
 *                       (three seats paid 2000 from a 1000 pool); an agent
 *                       can see it hold.
 *   poker_range_action  { hand, position, scenario }
 *                       -> { action, frequencies, mixed, position, scenario }
 *                       position and scenario are enums in the schema.
 *
 * Bad input comes back as a tool error (isError) whose message says what
 * would have been valid - "unknown position 'LJ'; valid: UTG, HJ, CO, BTN,
 * SB, BB" - because a model can recover from that, and "invalid input"
 * wastes its turn. It is never a crash.
 *
 * Every case in examples/poker/cases/v1.jsonl is pushed through the real server over real
 * MCP and must reproduce the frozen ground truth. That is what the with-tools
 * run rests on: if the tools answer correctly, the run measures whether the
 * model can use them.
 *
 * An optional fourth tool, poker_hand_rank, is allowed and not checked here.
 * Until the server exists this suite is skipped, visibly, rather than failed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { connectTools } from '../../../src/runners/tools.js';
import { equity as oracleEquity } from '../oracle/equity.js';
import { calculateICM } from '../oracle/icm.js';

const SERVER = 'examples/poker/mcp-server.mjs';

const REQUIRED = ['poker_equity', 'poker_icm', 'poker_range_action'];
const OPTIONAL = ['poker_hand_rank'];
const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const SCENARIOS = ['RFI', 'vsUTG', 'vsBTN'];

/** A result is a handful of fields, not a dump. */
const MAX_RESULT_CHARS = 500;

const cases = readFileSync('examples/poker/cases/v1.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ofType = (t) => cases.filter((c) => c.type === t);

const equityArgs = (k) => ({
  hero: k.hero,
  ...(k.board ? { board: k.board } : {}),
  ...(k.opponents?.length ? { opponents: k.opponents } : {}),
  ...(k.numOpponents ? { num_opponents: k.numOpponents } : {}),
});

describe.skipIf(!existsSync(SERVER))(`MCP server conformance (${SERVER})`, () => {
  let conn;
  beforeAll(async () => {
    conn = await connectTools(`node ${SERVER}`);
  }, 30000);
  afterAll(async () => {
    await conn?.close();
  });

  const tool = (name) => conn.tools.find((t) => t.name === name);

  /** Call a tool expecting success, and read its JSON result. */
  async function ok(name, args) {
    const res = await conn.call(name, args);
    expect(res.isError, `${name} failed: ${res.text}`).toBe(false);
    expect(res.text.length, `${name} result is ${res.text.length} chars`).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    try {
      return JSON.parse(res.text);
    } catch {
      throw new Error(`${name} returned text that is not JSON: ${res.text.slice(0, 200)}`);
    }
  }

  /** Call a tool expecting a readable error. */
  async function refused(name, args) {
    const res = await conn.call(name, args);
    expect(res.isError, `${name} accepted ${JSON.stringify(args)}: ${res.text}`).toBe(true);
    return res.text;
  }

  describe('the tool list a model sees', () => {
    it('offers the three tools, and nothing else but the optional hand ranker', () => {
      const names = conn.tools.map((t) => t.name);
      for (const n of REQUIRED) expect(names).toContain(n);
      for (const n of names) expect([...REQUIRED, ...OPTIONAL]).toContain(n);
    });

    it('describes every tool, and gives every one an object schema', () => {
      for (const t of conn.tools) {
        // The description and schema are all a model has to go on.
        expect(t.description.length, t.name).toBeGreaterThan(40);
        expect(t.inputSchema?.type, t.name).toBe('object');
      }
    });

    it('marks the arguments each tool cannot work without as required', () => {
      expect(tool('poker_equity').inputSchema.required).toEqual(['hero']);
      expect([...tool('poker_icm').inputSchema.required].sort()).toEqual(['payouts', 'stacks']);
      expect([...tool('poker_range_action').inputSchema.required].sort()).toEqual(['hand', 'position', 'scenario']);
    });

    it('lists position and scenario as enums, so a model never has to guess a spelling', () => {
      const props = tool('poker_range_action').inputSchema.properties;
      expect([...props.position.enum].sort()).toEqual([...POSITIONS].sort());
      expect([...props.scenario.enum].sort()).toEqual([...SCENARIOS].sort());
    });
  });

  describe('poker_equity', () => {
    it('reproduces the ground truth of every equity case', async () => {
      for (const k of ofType('equity')) {
        const r = await ok('poker_equity', equityArgs(k));
        // Exact means exact. A sampled truth was frozen at one seed and
        // sample count, so the server's own sample may differ - by far less
        // than the 2.5pp a model is allowed.
        const allowed = k.exact ? 1e-6 : 1;
        expect(Math.abs(r.equity_pct - k.expected * 100), k.id).toBeLessThanOrEqual(allowed);
        expect(r.exact, `${k.id} must say whether it enumerated`).toBe(k.exact);
        expect(r.method, k.id).toBe(k.exact ? 'enumerate' : 'sample');
        expect(r.equity * 100, `${k.id}: equity and equity_pct disagree`).toBeCloseTo(r.equity_pct, 6);
        expect(r.samples, k.id).toBeGreaterThan(0);
      }
    }, 120000);

    it('matches a direct oracle call exactly when it enumerates', async () => {
      const spec = { hero: 'AcAd', board: '2h 9h Kd', opponents: ['7h8h'] };
      const r = await ok('poker_equity', spec);
      expect(r.equity).toBe(oracleEquity(spec).equity);
    });

    it('samples past the enumeration cap and says so, rather than refusing', async () => {
      // Heads-up preflop is 1.7 million boards, over the cap. The eval's own
      // enumerateEquity throws here; the tool must answer and flag it.
      const r = await ok('poker_equity', { hero: 'AcAd', opponents: ['KcKd'] });
      expect(r.exact).toBe(false);
      expect(r.method).toBe('sample');
      expect(Math.abs(r.equity_pct - 82.6)).toBeLessThan(1);
    });

    it('reproduces a sample exactly when given the same seed', async () => {
      const args = { hero: 'AhKh', num_opponents: 2, seed: 7 };
      const a = await ok('poker_equity', args);
      const b = await ok('poker_equity', args);
      expect(a.equity).toBe(b.equity);
      expect(a.seed).toBe(7);
    });

    it('rejects bad cards with a message that names the problem', async () => {
      expect(await refused('poker_equity', { hero: 'AcAd', opponents: ['AcKd'] })).toMatch(/duplicate/i);
      // One fault per call, so each message is checked for the fault it has.
      expect(await refused('poker_equity', { hero: 'AcXd', opponents: ['KcKd'] })).toMatch(/Xd/);
      expect(await refused('poker_equity', { hero: 'AcAd', board: '2c 7d', opponents: ['KcKd'] })).toMatch(/board/i);
      expect(await refused('poker_equity', { hero: 'AcAd' })).toMatch(/opponent/i);
      expect(await refused('poker_equity', { hero: 'AcAd', numOpponents: 2 })).toMatch(/num_opponents/);
      expect(await refused('poker_equity', { board: '2c 7d 9h' })).toMatch(/hero/);
    });
  });

  describe('poker_icm', () => {
    it('reproduces the ground truth of every icm case, and says it sums to the pool', async () => {
      for (const k of ofType('icm')) {
        const r = await ok('poker_icm', { stacks: k.stacks, payouts: k.payouts });
        expect(r.equities).toHaveLength(k.expected.length);
        r.equities.forEach((v, i) => expect(Math.abs(v - k.expected[i]), `${k.id} seat ${i + 1}`).toBeLessThan(0.01));
        expect(r.pool, k.id).toBe(k.payouts.reduce((a, b) => a + b, 0));
        // Only a table with at least as many players as payouts can pay out
        // the whole pool; with fewer, the lower places are never reached.
        if (k.stacks.length >= k.payouts.length) expect(r.sums_to_pool, k.id).toBe(true);
      }
    });

    it('matches a direct oracle call', async () => {
      const stacks = [5000, 3000, 2000];
      const payouts = [500, 300, 200];
      const r = await ok('poker_icm', { stacks, payouts });
      expect(r.equities).toEqual(calculateICM(stacks, payouts));
    });

    it('rejects arguments it cannot use, naming the argument', async () => {
      expect(await refused('poker_icm', { stacks: 'lots', payouts: [60, 40] })).toMatch(/stacks/);
      expect(await refused('poker_icm', { stacks: [1000, 500] })).toMatch(/payouts/);
    });
  });

  describe('poker_range_action', () => {
    it('reproduces the chart for every range case, frequencies included', async () => {
      for (const k of ofType('range')) {
        const r = await ok('poker_range_action', { hand: k.hand, position: k.position, scenario: k.scenario });
        expect(r.action, k.id).toBe(k.expected);
        expect(r.frequencies, k.id).toEqual(k.frequencies);
        expect(r.mixed, k.id).toBe(k.mixed);
        expect([r.position, r.scenario], k.id).toEqual([k.position, k.scenario]);
      }
    });

    it('lists the valid positions when given an unknown one', async () => {
      const msg = await refused('poker_range_action', { hand: 'AKs', position: 'LJ', scenario: 'RFI' });
      expect(msg).toMatch(/LJ/);
      for (const p of POSITIONS) expect(msg).toContain(p);
    });

    it('names the scenarios a position does have when given one it does not', async () => {
      // The enums allow BTN with vsUTG, but the charts only cover the button
      // opening. A model told "BTN has: RFI" can fix its call in one step.
      const msg = await refused('poker_range_action', { hand: 'AKs', position: 'BTN', scenario: 'vsUTG' });
      expect(msg).toMatch(/RFI/);
    });

    it('explains the hand format when given a hand it cannot read', async () => {
      const msg = await refused('poker_range_action', { hand: 'AcKd', position: 'BTN', scenario: 'RFI' });
      expect(msg).toMatch(/AcKd/);
      // An example of the right shape is what gets the retry right.
      expect(msg).toMatch(/A5s|AKs|72o|QQ/);
    });
  });

  it('keeps serving after every kind of bad input', async () => {
    await refused('poker_equity', { hero: 'nonsense' });
    await refused('poker_icm', {});
    await refused('poker_range_action', {});
    const r = await ok('poker_icm', { stacks: [1, 1], payouts: [60, 40] });
    expect(r.equities).toEqual([50, 50]);
  });
});
