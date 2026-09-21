/**
 * Resolves a runner from a string, so the CLI takes `--model stub`,
 * `--model openai:gpt-4o-mini` or `--model anthropic:claude-sonnet-5` and
 * nothing else in the pipeline needs to know which provider answered.
 */
import { createStubRunner } from './stub.js';
import { createOpenAIRunner, createAnthropicRunner } from './api.js';

export function createRunner(spec, opts = {}) {
  const [provider, ...rest] = String(spec).split(':');
  const model = rest.join(':') || undefined;
  switch (provider) {
    case 'stub':
      return createStubRunner({ seed: opts.seed ?? 1, skill: opts.skill ?? 0.8 });
    case 'openai':
      return createOpenAIRunner({ ...(model ? { model } : {}), temperature: opts.temperature ?? 0 });
    case 'anthropic':
      return createAnthropicRunner({ ...(model ? { model } : {}), temperature: opts.temperature ?? 0 });
    default:
      throw new Error(`unknown runner "${spec}"; expected stub, openai:<model> or anthropic:<model>`);
  }
}
