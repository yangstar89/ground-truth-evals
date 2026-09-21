/**
 * The one place that talks to the network.
 *
 * Retries are deliberately narrow: rate limits and server faults are worth
 * retrying because they are transient, and everything else is a bug in the
 * request that retrying would only repeat. A 401 in particular must fail
 * immediately and loudly - retrying a bad key four times just delays the
 * message that the key is bad.
 *
 * Errors carry the response body, because an API's own message ("this model
 * does not support temperature") is almost always more useful than the status
 * code. Nothing here ever logs or returns a credential.
 */

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * An empty account, which neither provider reports with a status of its own:
 * OpenAI sends a 429 that looks exactly like a rate limit, and Anthropic a
 * 400 that looks like a malformed request. Only the body tells them apart.
 */
const OUT_OF_CREDIT = /insufficient_quota|credit_balance_exhausted|credit balance is too low/i;

/**
 * Errors that will fail every remaining case identically, so the run should
 * stop at the first one. Seventy-five copies of "your key is bad" is not a
 * result, and graded, it once looked like a model scoring 0/75.
 */
export function isFatal(e) {
  if (!(e instanceof HttpError)) return false;
  return e.status === 401 || e.status === 403 || OUT_OF_CREDIT.test(String(e.body));
}

export class HttpError extends Error {
  constructor(status, body, url) {
    // Keep the message short; the body is attached for callers that want it.
    super(`HTTP ${status} from ${new URL(url).host}: ${String(body).slice(0, 300)}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST JSON, with backoff on transient failures.
 *
 * `retryAfter` from the server wins over our own backoff when present: it is
 * the only party that knows when the limit resets.
 */
export async function postJson(url, { headers = {}, body, attempts = 4, timeoutMs = 120000, signal } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return await res.json();

      const text = await res.text().catch(() => '');
      const err = new HttpError(res.status, text, url);
      // A 429 from an empty account will not clear by waiting.
      if (!RETRYABLE.has(res.status) || isFatal(err) || attempt === attempts) throw err;

      const after = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(after) && after > 0
        ? after * 1000
        : Math.min(30000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      lastError = err;
      await sleep(wait);
    } catch (e) {
      // A timeout or a dropped connection is worth one more try; a thrown
      // HttpError has already decided for itself whether it is retryable.
      if (e instanceof HttpError) throw e;
      if (signal?.aborted || attempt === attempts) throw e;
      lastError = e;
      await sleep(Math.min(30000, 500 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError ?? new Error('request failed');
}

/**
 * Run an async job over a list with bounded concurrency, preserving order.
 *
 * Bounded rather than unbounded because seventy-five simultaneous requests is
 * how you find a rate limit you did not need to find.
 */
export async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}
