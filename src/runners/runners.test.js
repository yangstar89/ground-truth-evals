import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStubRunner } from './stub.js';
import { createRunner } from './index.js';
import { createOpenAIRunner, createAnthropicRunner, TruncatedError } from './api.js';
import { mapLimit, postJson, isFatal, HttpError } from './http.js';
import { renderMarkdown, renderLine } from '../report.js';
import { grade, summarise } from '../graders/index.js';
import { demoSuite } from '../fixtures/demo-suite.js';
import { normaliseUsage } from '../usage.js';

// Tagged copies of the fixture cases: the report groups by tag, and a run
// needs more than one task type for the per-type sections to mean anything.
const sumCase = { id: 'sum-001', type: 'sum', tag: 'small', a: 2, b: 3, expected: 5, tolerance: 0.5 };
const splitCase = { id: 'split-001', type: 'split', tag: 'three-ways', total: 100, ways: 3, expected: [40, 35, 25], tolerance: 2 };
const sumCase2 = { id: 'sum-002', type: 'sum', tag: 'small', a: 10, b: 11, expected: 21, tolerance: 0.5 };

describe('stub runner', () => {
  it('needs no credentials', () => {
    expect(() => createRunner(demoSuite, 'stub')).not.toThrow();
  });

  it('refuses a suite with no stub rather than inventing replies', () => {
    const { stub, ...noStub } = demoSuite;
    expect(() => createRunner(noStub, 'stub')).toThrow(/has no stub/);
  });
});

describe('createRunner', () => {
  it('rejects a provider it does not know', () => {
    expect(() => createRunner(demoSuite, 'mistral:large')).toThrow(/unknown runner/);
  });

  it('refuses to build an api runner with no key, rather than calling without one', () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createRunner(demoSuite, 'openai:gpt-4o-mini')).toThrow(/OPENAI_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});

describe('api runners and models that reject temperature', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Answers 400 while the request carries a temperature, then succeeds without one.
  function fakeApi(okBody) {
    const sent = [];
    vi.stubGlobal('fetch', async (url, init) => {
      const body = JSON.parse(init.body);
      sent.push(body);
      if ('temperature' in body) {
        return new Response('{"error":{"message":"`temperature` is deprecated for this model."}}', { status: 400 });
      }
      return new Response(JSON.stringify(okBody), { status: 200 });
    });
    return sent;
  }

  const adapters = [
    ['openai', () => createOpenAIRunner({ apiKey: 'test' }), { choices: [{ message: { content: '{"total":5}' } }] }],
    ['anthropic', () => createAnthropicRunner({ apiKey: 'test' }), { content: [{ type: 'text', text: '{"total":5}' }] }],
  ];

  for (const [name, make, okBody] of adapters) {
    it(`${name}: retries once without temperature instead of failing every case`, async () => {
      const sent = fakeApi(okBody);
      const runner = make();
      const { text } = await runner.complete(sumCase, 'prompt');
      expect(text).toBe('{"total":5}');
      expect(sent.map((b) => 'temperature' in b)).toEqual([true, false]);
    });

    it(`${name}: records null temperature afterwards, so the run file does not claim 0`, async () => {
      const sent = fakeApi(okBody);
      const runner = make();
      await runner.complete(sumCase, 'prompt');
      await runner.complete(sumCase, 'prompt');
      expect(runner.temperature).toBeNull();
      // The second case goes straight through, rather than paying for the 400 again.
      expect(sent.map((b) => 'temperature' in b)).toEqual([true, false, false]);
    });

    it(`${name}: every in-flight request retries, not just the first to be rejected`, async () => {
      // Hold every reply until all six requests have gone out, as a real
      // concurrent run does, so all six carry a temperature and all six are
      // rejected after the first rejection has already flipped the flag.
      const sent = [];
      let release;
      const gate = new Promise((r) => (release = r));
      vi.stubGlobal('fetch', async (url, init) => {
        const body = JSON.parse(init.body);
        sent.push(body);
        if (sent.length === 6) release();
        await gate;
        if ('temperature' in body) {
          return new Response('{"error":{"message":"`temperature` is deprecated for this model."}}', { status: 400 });
        }
        return new Response(JSON.stringify(okBody), { status: 200 });
      });
      const runner = make();
      const replies = await Promise.all(Array.from({ length: 6 }, () => runner.complete(sumCase, 'prompt')));
      expect(replies.map((r) => r.text)).toEqual(Array(6).fill('{"total":5}'));
    });

    it(`${name}: does not swallow a 400 that is about something else`, async () => {
      vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"credit balance is too low"}}', { status: 400 }));
      await expect(make().complete(sumCase, 'prompt')).rejects.toThrow(/credit balance/);
    });
  }

  // A reply stopped by the output cap must fail the call, not reach a grader
  // as an unreadable answer that is then scored against the model.
  const truncated = [
    ['openai', () => createOpenAIRunner({ apiKey: 'test', temperature: null }),
      { choices: [{ finish_reason: 'length', message: { content: '{"shares": [40, 35, 22' } }], usage: { prompt_tokens: 40, completion_tokens: 16000 } }],
    ['anthropic', () => createAnthropicRunner({ apiKey: 'test', temperature: null }),
      { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }], usage: { input_tokens: 40, output_tokens: 16000 } }],
  ];
  for (const [name, make, body] of truncated) {
    it(`${name}: a reply cut off at the output cap is an error, not a wrong answer`, async () => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status: 200 }));
      await expect(make().complete(splitCase, 'prompt')).rejects.toThrow(TruncatedError);
    });

    it(`${name}: the tokens a cut-off reply burned are reported, not lost`, async () => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status: 200 }));
      const err = await make().complete(splitCase, 'prompt').catch((e) => e);
      // These are the costliest cases in a run: a full output budget spent
      // for no answer. Dropping their usage understates exactly them.
      expect(normaliseUsage(err.usage)).toEqual({ input: 40, output: 16000 });
    });
  }
});

describe('the tool loop', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A stand-in for an MCP connection: one tool, and a log of what it was asked. */
  function fakeTools(reply = { text: '{"total": 5}', isError: false }) {
    const asked = [];
    return {
      asked,
      command: 'fake',
      tools: [{ name: 'add', description: 'exact addition', inputSchema: { type: 'object', properties: {} } }],
      async call(name, args) {
        asked.push({ name, args });
        return reply;
      },
    };
  }

  /** Replies from a queue, keeping every request body for inspection. */
  function scriptedApi(replies) {
    const bodies = [];
    vi.stubGlobal('fetch', async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    });
    return bodies;
  }

  const openaiToolCall = (id = 'c1') => ({
    choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'add', arguments: '{"a":2,"b":3}' } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
  const openaiAnswer = { choices: [{ finish_reason: 'stop', message: { content: '{"total": 5}' } }], usage: { prompt_tokens: 20, completion_tokens: 6 } };

  const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
  const anthropicToolCall = (id = 't1') => ({
    stop_reason: 'tool_use',
    content: [thinking, { type: 'tool_use', id, name: 'add', input: { a: 2, b: 3 } }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  const anthropicAnswer = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"total": 5}' }], usage: { input_tokens: 20, output_tokens: 6 } };

  it('openai: runs the call, sends the result back, and returns the final answer with the call recorded', async () => {
    const tools = fakeTools();
    const bodies = scriptedApi([openaiToolCall(), openaiAnswer]);
    const res = await createOpenAIRunner({ apiKey: 'test', temperature: null, tools }).complete(sumCase, 'prompt');
    expect(res.text).toBe('{"total": 5}');
    expect(tools.asked).toEqual([{ name: 'add', args: { a: 2, b: 3 } }]);
    expect(res.toolCalls).toHaveLength(1);
    expect(bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"total": 5}' });
    // Usage covers both requests, or a with-tools run would look cheaper than it was.
    expect(res.usage).toMatchObject({ prompt_tokens: 30, completion_tokens: 11 });
  });

  it('anthropic: runs the call and returns the turn intact, thinking blocks included', async () => {
    const tools = fakeTools();
    const bodies = scriptedApi([anthropicToolCall(), anthropicAnswer]);
    const res = await createAnthropicRunner({ apiKey: 'test', temperature: null, tools }).complete(sumCase, 'prompt');
    expect(res.text).toBe('{"total": 5}');
    expect(bodies[1].messages[1]).toEqual({ role: 'assistant', content: anthropicToolCall().content });
    expect(bodies[1].messages[2].content).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: '{"total": 5}' }]);
    expect(res.usage).toMatchObject({ input_tokens: 30, output_tokens: 11 });
  });

  it('shows a failing tool to the model as an error it can correct, not a crash', async () => {
    const tools = fakeTools({ text: 'a and b must be numbers', isError: true });
    const bodies = scriptedApi([anthropicToolCall(), anthropicAnswer]);
    const res = await createAnthropicRunner({ apiKey: 'test', temperature: null, tools }).complete(sumCase, 'prompt');
    expect(bodies[1].messages[2].content[0]).toMatchObject({ is_error: true });
    expect(res.toolCalls[0].isError).toBe(true);
  });

  it('abandons a model that keeps calling tools, keeping the calls it made', async () => {
    const tools = fakeTools();
    scriptedApi(Array.from({ length: 20 }, (_, i) => openaiToolCall(`c${i}`)));
    const err = await createOpenAIRunner({ apiKey: 'test', temperature: null, tools }).complete(sumCase, 'prompt').catch((e) => e);
    expect(err).toBeInstanceOf(TruncatedError);
    expect(err.toolCalls.length).toBeGreaterThan(0);
  });

  it('sends no tools and records no tool calls on an unaided run', async () => {
    const bodies = scriptedApi([openaiAnswer]);
    const res = await createOpenAIRunner({ apiKey: 'test', temperature: null }).complete(sumCase, 'prompt');
    expect(bodies[0].tools).toBeUndefined();
    expect(res.toolCalls).toBeUndefined();
  });
});

describe('errors that end a run', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The bodies the two providers actually sent for an empty account.
  const openaiEmpty = '{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}';
  const anthropicEmpty = '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';

  it('treats an empty account as fatal, whichever status it arrives with', () => {
    expect(isFatal(new HttpError(429, openaiEmpty, 'https://api.openai.com/v1'))).toBe(true);
    expect(isFatal(new HttpError(400, anthropicEmpty, 'https://api.anthropic.com/v1'))).toBe(true);
    expect(isFatal(new HttpError(401, 'bad key', 'https://api.openai.com/v1'))).toBe(true);
  });

  it('does not treat an ordinary rate limit or a bad request as fatal', () => {
    expect(isFatal(new HttpError(429, '{"error":{"type":"rate_limit_exceeded"}}', 'https://api.openai.com/v1'))).toBe(false);
    expect(isFatal(new HttpError(400, 'temperature is deprecated', 'https://api.anthropic.com/v1'))).toBe(false);
    expect(isFatal(new Error('socket hang up'))).toBe(false);
  });

  it('does not retry an out-of-credit 429, which waiting will never clear', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response(openaiEmpty, { status: 429 });
    });
    await expect(postJson('https://api.openai.com/v1/x', { body: {} })).rejects.toThrow(HttpError);
    expect(calls).toBe(1);
  });
});

describe('mapLimit', () => {
  it('keeps input order regardless of completion order', async () => {
    const items = [30, 5, 20, 1, 10];
    const out = await mapLimit(items, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual(items);
  });

  it('never exceeds the limit', async () => {
    let live = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('copes with an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe('report', () => {
  const cases = [sumCase, splitCase, sumCase2];
  const results = [
    grade(demoSuite, sumCase, '{"total": 5}'),
    grade(demoSuite, splitCase, '{"shares": [40, 35, 25]}'),
    grade(demoSuite, sumCase2, '{"total": 40}'),
  ];
  const summary = summarise(results);
  const meta = { model: 'stub(test)', temperature: 0, durationMs: 1234 };

  it('keeps a failure table whole when a detail spans lines or holds a pipe', () => {
    // A failed request quotes the API body, which OpenAI pretty-prints.
    const broken = { ...results[0], pass: false, detail: 'request failed: HTTP 429 {\n    "error": "a | b"\n}' };
    const md = renderMarkdown({ meta, summary, results: [broken], cases, diff: null });
    const row = md.split('\n').find((l) => l.startsWith(`| ${broken.id} `));
    expect(row).toContain('HTTP 429 { "error": "a \\| b" }');
    expect(row.endsWith('|')).toBe(true);
  });

  it('renders every section, and never blends the task types', () => {
    const md = renderMarkdown({ meta, summary, results, cases });
    expect(md).toContain('# Eval run — stub(test)');
    expect(md).toContain('## By task');
    expect(md).toContain('## By kind of spot');
    expect(md).toContain('## Failures (1)');
    expect(md).toContain('| sum |');
    expect(md).toContain('| split |');
  });

  it('marks thin tags, so a one-case rate is not read as a measurement', () => {
    expect(renderMarkdown({ meta, summary, results, cases })).toContain('_thin_');
  });

  it('shows the failing case with its reason', () => {
    const md = renderMarkdown({ meta, summary, results, cases });
    expect(md).toContain('sum-002');
    expect(md).toContain('truth 21.0');
  });

  it('includes a baseline section only when there is a baseline', () => {
    expect(renderMarkdown({ meta, summary, results, cases })).not.toContain('## Against baseline');
    const withDiff = renderMarkdown({
      meta, summary, results, cases,
      diff: {
        baselineName: 'b.json',
        regressions: [{ id: 'sum-001', type: 'sum', detail: 'broke' }],
        fixes: [], only_in_current: [], only_in_baseline: [],
      },
    });
    expect(withDiff).toContain('## Against baseline');
    expect(withDiff).toContain('**Regressions (1)**');
  });

  it('summarises to one line for a terminal', () => {
    const line = renderLine(meta, summary);
    expect(line).toContain('stub(test)');
    expect(line).toContain('2/3');
  });
});
