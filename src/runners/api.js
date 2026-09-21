/**
 * Provider adapters.
 *
 * Both read their credential from the environment and neither stores, logs or
 * returns it. A run file records the model id and the sampling settings,
 * because those are what a result means - and nothing else about the call.
 *
 * Temperature is requested as 0 by default, since an eval wants the model's
 * modal answer rather than a sample from its distribution. Some newer models
 * reject the parameter outright; rather than make the caller know which, both
 * adapters notice that specific rejection once and retry without it. The
 * runner's `temperature` then reads null, so the run file records what was
 * actually sent rather than what was asked for.
 *
 * Given `tools` (a connection from tools.js), an adapter runs the tool loop:
 * the model may call tools, each call goes to the MCP server, and the result
 * goes back, until the model answers in text. Every call is returned with
 * the reply, because in a with-tools run *how* the model used the tools - or
 * whether it used them at all - is as much the result as the answer.
 */
import { postJson, HttpError } from './http.js';

const SYSTEM = 'You are a precise poker calculator. Follow the output schema exactly.';

/**
 * Tool rounds allowed before a case is abandoned. Each case needs one call;
 * eight leaves room for a model to correct a bad argument several times
 * without letting a loop run up a bill.
 */
export const MAX_TOOL_ROUNDS = 8;

/** A 400 whose body complains about temperature, and nothing broader. */
function rejectsTemperature(e) {
  return e instanceof HttpError && e.status === 400 && /temperature/i.test(String(e.body));
}

/**
 * A model that never finished answering: it hit the output cap, or it was
 * still calling tools when the rounds ran out.
 *
 * Graded, a cut-off reply would read as "unparseable" and be scored against
 * the model as a formatting failure, so it becomes a run error of its own
 * instead. This is not hypothetical: at a 1024-token cap, Sonnet 5 spent the
 * whole budget thinking on 20 of 75 cases and returned no text at all.
 */
export class TruncatedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TruncatedError';
  }
}

const capped = (maxTokens) =>
  new TruncatedError(
    `reply truncated at the output cap${maxTokens ? ` of ${maxTokens} tokens` : ''}; raise it rather than grade a partial answer`,
  );

/**
 * Call once with temperature and, if this model rejects it, once without.
 *
 * Whether *this* call sent a temperature is captured before it goes out. The
 * shared flag cannot answer that: with several requests in flight, the first
 * rejection flips it, and every sibling that also sent a temperature would
 * read the flipped flag and rethrow instead of retrying.
 */
function withTemperatureFallback(runner, state, call) {
  return async (prompt) => {
    const sent = state.sendTemperature;
    try {
      return await call(prompt, sent);
    } catch (e) {
      if (!sent || !rejectsTemperature(e)) throw e;
      state.sendTemperature = false;
      runner.temperature = null;
      return await call(prompt, false);
    }
  };
}

/** Sum two usage objects field by field, for a reply that took several requests. */
function addUsage(total, next) {
  if (!next) return total;
  if (!total) return { ...next };
  const out = { ...total };
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === 'number') out[k] = (typeof out[k] === 'number' ? out[k] : 0) + v;
  }
  return out;
}

/**
 * Run one tool call and keep a record of it. A result is kept short in the
 * record; the model still sees all of it.
 */
async function runTool(tools, calls, name, args) {
  const result = await tools.call(name, args);
  calls.push({ name, args, isError: result.isError, result: result.text.slice(0, 400) });
  return result;
}

/**
 * Attach the calls made so far to an error, so a case that failed mid-loop
 * still shows what the model tried.
 */
function withCalls(e, calls) {
  if (calls.length && e && typeof e === 'object') e.toolCalls = calls;
  return e;
}

export function createOpenAIRunner({
  model = 'gpt-4o-mini',
  temperature = 0,
  tools = null,
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl = 'https://api.openai.com/v1',
} = {}) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in, or pass it inline for one run.');
  }
  // Flipped the first time the API tells us this model has no temperature.
  const state = { sendTemperature: temperature !== null };
  const toolDefs = tools?.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  async function request(messages, withTemperature) {
    const json = await postJson(`${baseUrl}/chat/completions`, {
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages,
        ...(toolDefs ? { tools: toolDefs } : {}),
        ...(withTemperature ? { temperature } : {}),
      },
    });
    const choice = json.choices?.[0];
    if (choice?.finish_reason === 'length') throw capped();
    return { message: choice?.message ?? {}, usage: json.usage ?? null };
  }

  async function call(prompt, withTemperature) {
    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ];
    const calls = [];
    let usage = null;
    try {
      for (let round = 0; ; round++) {
        const { message, usage: u } = await request(messages, withTemperature);
        usage = addUsage(usage, u);
        const requested = message.tool_calls ?? [];
        if (!tools || requested.length === 0) {
          return { text: message.content ?? '', usage, ...(tools ? { toolCalls: calls } : {}) };
        }
        if (round === MAX_TOOL_ROUNDS) {
          throw new TruncatedError(`the model was still calling tools after ${MAX_TOOL_ROUNDS} rounds`);
        }
        messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: requested });
        for (const tc of requested) {
          let args;
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            // Malformed arguments are the model's mistake to see and correct.
            calls.push({ name: tc.function.name, args: tc.function.arguments, isError: true, result: 'arguments were not valid JSON' });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: 'error: arguments were not valid JSON' });
            continue;
          }
          const result = await runTool(tools, calls, tc.function.name, args);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.isError ? `error: ${result.text}` : result.text });
        }
      }
    } catch (e) {
      throw withCalls(e, calls);
    }
  }

  const runner = {
    name: `openai:${model}${tools ? '+tools' : ''}`,
    model,
    temperature: state.sendTemperature ? temperature : null,
  };
  const send = withTemperatureFallback(runner, state, call);
  runner.complete = (kase, prompt) => send(prompt);
  return runner;
}

export function createAnthropicRunner({
  model = 'claude-sonnet-5',
  temperature = 0,
  // Current models think by default, and thinking tokens count against this
  // cap. The answer itself is a line of JSON; the headroom is for the thinking.
  maxTokens = 16000,
  // A long think can outlast the default two minutes on a non-streaming call.
  timeoutMs = 600000,
  tools = null,
  apiKey = process.env.ANTHROPIC_API_KEY,
  baseUrl = 'https://api.anthropic.com/v1',
} = {}) {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or pass it inline for one run.');
  }
  const state = { sendTemperature: temperature !== null };
  const toolDefs = tools?.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  async function request(messages, withTemperature) {
    const json = await postJson(`${baseUrl}/messages`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model,
        max_tokens: maxTokens,
        ...(withTemperature ? { temperature } : {}),
        system: SYSTEM,
        ...(toolDefs ? { tools: toolDefs } : {}),
        messages,
      },
      timeoutMs,
    });
    if (json.stop_reason === 'max_tokens') throw capped(maxTokens);
    return json;
  }

  async function call(prompt, withTemperature) {
    const messages = [{ role: 'user', content: prompt }];
    const calls = [];
    let usage = null;
    try {
      for (let round = 0; ; round++) {
        const json = await request(messages, withTemperature);
        usage = addUsage(usage, json.usage);
        const content = json.content ?? [];
        const requested = content.filter((b) => b.type === 'tool_use');
        if (!tools || json.stop_reason !== 'tool_use' || requested.length === 0) {
          // content is a list of blocks; join the text ones and ignore the rest.
          const text = content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();
          return { text, usage, ...(tools ? { toolCalls: calls } : {}) };
        }
        if (round === MAX_TOOL_ROUNDS) {
          throw new TruncatedError(`the model was still calling tools after ${MAX_TOOL_ROUNDS} rounds`);
        }
        // The whole turn goes back unchanged, thinking blocks included: the
        // API requires them intact to continue a turn that used tools.
        messages.push({ role: 'assistant', content });
        const results = [];
        for (const b of requested) {
          const result = await runTool(tools, calls, b.name, b.input);
          results.push({ type: 'tool_result', tool_use_id: b.id, content: result.text, ...(result.isError ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
      }
    } catch (e) {
      throw withCalls(e, calls);
    }
  }

  const runner = {
    name: `anthropic:${model}${tools ? '+tools' : ''}`,
    model,
    temperature: state.sendTemperature ? temperature : null,
  };
  const send = withTemperatureFallback(runner, state, call);
  runner.complete = (kase, prompt) => send(prompt);
  return runner;
}
