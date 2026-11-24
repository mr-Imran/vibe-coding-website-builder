// A pretend browser without a screen: it keeps its own cookie and session
// token, the way a separate browser does. The tests use it for every user;
// tools/journey.js uses it for "a second person, at the same time"
// (app.asOther('member')).

export function createClient(base) {
  let cookie = '';
  let csrf = '';
  const client = {
    id: null,
    get cookie() { return cookie; },
    get csrf() { return csrf; },
    set csrf(value) { csrf = value; },
    async request(method, url, body = undefined, headers = {}) {
      const h = { ...headers };
      if (cookie && h.Cookie === undefined) h.Cookie = cookie;
      if (method !== 'GET' && csrf && h['X-CSRF-Token'] === undefined) h['X-CSRF-Token'] = csrf;
      let payload;
      if (body !== undefined) {
        if (typeof body === 'string') payload = body;
        else { payload = JSON.stringify(body); h['Content-Type'] ??= 'application/json'; }
      }
      const res = await fetch(base + url, { method, headers: h, body: payload });
      for (const line of res.headers.getSetCookie()) cookie = line.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      if (json && json.csrf) csrf = json.csrf;
      return { status: res.status, body: json, text, headers: res.headers };
    },
    get: (url, headers) => client.request('GET', url, undefined, headers),
    post: (url, body, headers) => client.request('POST', url, body, headers),
    put: (url, body, headers) => client.request('PUT', url, body, headers),
    patch: (url, body, headers) => client.request('PATCH', url, body, headers),
    delete: (url, headers) => client.request('DELETE', url, undefined, headers),
    // Open the live-update stream. next() waits for the next event.
    async events() {
      const controller = new AbortController();
      const res = await fetch(`${base}/api/events`, { headers: { Cookie: cookie }, signal: controller.signal });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const queue = [];
      const read = async () => {
        for (;;) {
          const cut = buffer.indexOf('\n\n');
          if (cut >= 0) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const type = /^event: (.*)$/m.exec(frame);
            const data = /^data: (.*)$/m.exec(frame);
            if (type && data) return { type: type[1], data: JSON.parse(data[1]) };
            continue;
          }
          const { done, value } = await reader.read();
          if (done) return null;
          buffer += decoder.decode(value, { stream: true });
        }
      };
      return {
        status: res.status,
        async next(timeoutMs = 2000) {
          if (queue.length) return queue.shift();
          const timer = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
          const pending = read();
          const got = await Promise.race([pending, timer]);
          if (got === 'timeout') { pending.then((late) => { if (late) queue.push(late); }).catch(() => {}); return null; }
          return got;
        },
        close() { controller.abort(); },
      };
    },
  };
  return client;
}

// A client already signed in with an email and password.
export async function signedIn(base, { email, password }) {
  const client = createClient(base);
  const res = await client.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`could not sign in ${email}: ${res.status} ${res.body && res.body.error ? res.body.error.message : ''}`.trim());
  client.id = res.body && res.body.user ? res.body.user.id : null;
  return client;
}
