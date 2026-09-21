/**
 * Provider adapters.
 *
 * Both read their credential from the environment and neither stores, logs or
 * returns it. A run file records the model id and the sampling settings,
 * because those are what a result means - and nothing else about the call.
 *
 * Temperature is requested as 0 by default, since an eval wants the model's
 * modal answer rather than a sample from its distribution. Some newer models
 * reject the parameter outright; rather than make the caller know which, the
 * OpenAI adapter notices that specific rejection once and retries without it.
 */
import { postJson, HttpError } from './http.js';

const SYSTEM = 'You are a precise poker calculator. Follow the output schema exactly.';

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
  let sendTemperature = temperature !== null;

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
    const text = json.choices?.[0]?.message?.content ?? '';
    return { text, usage: json.usage ?? null };
  }

  return {
    name: `openai:${model}`,
    model,
    temperature: sendTemperature ? temperature : null,
    async complete(kase, prompt) {
      try {
        return await call(prompt, sendTemperature);
      } catch (e) {
        const rejectsTemperature =
          e instanceof HttpError &&
          e.status === 400 &&
          /temperature/i.test(String(e.body));
        if (!rejectsTemperature || !sendTemperature) throw e;
        sendTemperature = false;
        this.temperature = null;
        return await call(prompt, false);
      }
    },
  };
}

export function createAnthropicRunner({
  model = 'claude-sonnet-5',
  temperature = 0,
  maxTokens = 1024,
  apiKey = process.env.ANTHROPIC_API_KEY,
  baseUrl = 'https://api.anthropic.com/v1',
} = {}) {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or pass it inline for one run.');
  }
  return {
    name: `anthropic:${model}`,
    model,
    temperature,
    async complete(kase, prompt) {
      const json = await postJson(`${baseUrl}/messages`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model,
          max_tokens: maxTokens,
          temperature,
          system: SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        },
      });
      // content is a list of blocks; join the text ones and ignore the rest.
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return { text, usage: json.usage ?? null };
    },
  };
}
