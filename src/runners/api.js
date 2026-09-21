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
 */
import { postJson, HttpError } from './http.js';

const SYSTEM = 'You are a precise poker calculator. Follow the output schema exactly.';

/** A 400 whose body complains about temperature, and nothing broader. */
function rejectsTemperature(e) {
  return e instanceof HttpError && e.status === 400 && /temperature/i.test(String(e.body));
}

/**
 * A reply cut off by the output cap is the harness's failure, not the model's.
 * Graded, it would read as "unparseable" and be scored against the model, so
 * it becomes a run error instead. This is not hypothetical: at a 1024-token
 * cap, Sonnet 5 spent the whole budget thinking on 20 of 75 cases and returned
 * no text at all.
 */
export class TruncatedError extends Error {
  constructor(maxTokens) {
    super(`reply truncated at the output cap${maxTokens ? ` of ${maxTokens} tokens` : ''}; raise it rather than grade a partial answer`);
    this.name = 'TruncatedError';
  }
}

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

export function createOpenAIRunner({
  model = 'gpt-4o-mini',
  temperature = 0,
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl = 'https://api.openai.com/v1',
} = {}) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in, or pass it inline for one run.');
  }
  // Flipped the first time the API tells us this model has no temperature.
  const state = { sendTemperature: temperature !== null };

  async function call(prompt, withTemperature) {
    const body = {
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      ...(withTemperature ? { temperature } : {}),
    };
    const json = await postJson(`${baseUrl}/chat/completions`, {
      headers: { authorization: `Bearer ${apiKey}` },
      body,
    });
    const choice = json.choices?.[0];
    if (choice?.finish_reason === 'length') throw new TruncatedError();
    return { text: choice?.message?.content ?? '', usage: json.usage ?? null };
  }

  const runner = {
    name: `openai:${model}`,
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
  apiKey = process.env.ANTHROPIC_API_KEY,
  baseUrl = 'https://api.anthropic.com/v1',
} = {}) {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or pass it inline for one run.');
  }
  const state = { sendTemperature: temperature !== null };

  async function call(prompt, withTemperature) {
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
        messages: [{ role: 'user', content: prompt }],
      },
      timeoutMs,
    });
    if (json.stop_reason === 'max_tokens') throw new TruncatedError(maxTokens);
    // content is a list of blocks; join the text ones and ignore the rest.
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return { text, usage: json.usage ?? null };
  }

  const runner = {
    name: `anthropic:${model}`,
    model,
    temperature: state.sendTemperature ? temperature : null,
  };
  const send = withTemperatureFallback(runner, state, call);
  runner.complete = (kase, prompt) => send(prompt);
  return runner;
}
