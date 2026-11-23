// Calling a service on the internet (weather, maps, exchange rates, email).
//
// Other people's services are slow sometimes, down sometimes, and now and
// then answer with something that is not what their documentation promises.
// The app must stay up and say something useful in each of those cases.
//
// Keys for these services come from the environment (process.env), never from
// a file in the project and never from the page.

const breakers = new Map();

export class ExternalError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;           // timeout | network | http | malformed | invalid | too_large | open
  }
}

//   const result = await callExternal('rates', 'https://api.example/rates?base=EUR', {
//     validate: (data) => {                       // throw if the answer is not what we need
//       if (typeof data?.rates?.USD !== 'number') throw new Error('no USD rate');
//       return { usd: data.rates.USD };
//     },
//     fallback: () => lastGoodRates,              // optional: what to use when the service fails
//   });
//   result -> { ok: true,  value, source: 'live' }
//          -> { ok: false, value: <fallback or null>, source: 'fallback' | 'none', error: { kind, message } }
//
// It never throws for a failure of the other side. The caller decides what
// the person sees: a stale value with a note, or "try again later".
export async function callExternal(name, url, {
  method = 'GET', headers = {}, body = undefined,
  timeoutMs = 5000, retries = 2, backoffMs = 300, maxBytes = 1_000_000,
  validate = (data) => data, fallback = null,
  breakerThreshold = 5, breakerCooldownMs = 30_000,
  fetchImpl = fetch,
} = {}) {
  const breaker = breakers.get(name) || { fails: 0, openUntil: 0 };
  breakers.set(name, breaker);

  const fail = (error) => ({
    ok: false,
    value: fallback ? fallback(error) : null,
    source: fallback ? 'fallback' : 'none',
    error: { kind: error.kind || 'network', message: error.message },
  });

  // After several failures in a row, stop asking for a while. A service that
  // is down should not make every page of the app wait for a timeout.
  if (Date.now() < breaker.openUntil) return fail(new ExternalError('open', `${name} is not answering; not asking again yet.`));

  // Only repeat requests that are safe to repeat. A POST may have been
  // carried out even though the answer got lost.
  const attempts = ['GET', 'HEAD', 'PUT', 'DELETE'].includes(method) ? retries + 1 : 1;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const value = await once();
      breaker.fails = 0;
      return { ok: true, value, source: 'live' };
    } catch (err) {
      last = err instanceof ExternalError ? err : new ExternalError('network', err.message);
      // A wrong answer will be wrong again; only waiting and network problems are worth a retry.
      const retryable = ['timeout', 'network'].includes(last.kind) || (last.kind === 'http' && last.retryable);
      if (!retryable || attempt === attempts) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
    }
  }
  breaker.fails++;
  if (breaker.fails >= breakerThreshold) { breaker.openUntil = Date.now() + breakerCooldownMs; breaker.fails = 0; }
  return fail(last);

  async function once() {
    let res;
    try {
      res = await fetchImpl(url, {
        method, headers,
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new ExternalError(timedOut ? 'timeout' : 'network', timedOut ? `${name} took longer than ${timeoutMs} ms.` : `${name} could not be reached.`);
    }
    if (!res.ok) {
      const e = new ExternalError('http', `${name} answered with status ${res.status}.`);
      e.retryable = res.status >= 500 || res.status === 429;
      throw e;
    }
    let text;
    try {
      text = await readLimited(res, maxBytes, timeoutMs);
    } catch (err) {
      if (err instanceof ExternalError) throw err;
      throw new ExternalError('timeout', `${name} stopped answering part-way.`);
    }
    let data;
    try { data = JSON.parse(text); }
    catch { throw new ExternalError('malformed', `${name} sent an answer that could not be read.`); }
    try { return validate(data); }
    catch (err) { throw new ExternalError('invalid', `${name} sent an answer without the expected content (${err.message}).`); }
  }
}

async function readLimited(res, maxBytes, timeoutMs) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) { await reader.cancel(); throw new ExternalError('timeout', 'The answer took too long to arrive.'); }
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new ExternalError('too_large', 'The answer was larger than expected.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function resetBreakers() { breakers.clear(); }
