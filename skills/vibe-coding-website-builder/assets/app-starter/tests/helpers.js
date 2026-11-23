// Starts the real app on a spare port with a throw-away database, and gives
// each pretend user their own cookie jar, the way separate browsers have.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { buildApp } from '../server.js';

const quiet = { log() {}, error() {} };

// setup(built) can create extra tables and routes before the server listens.
export async function startApp({ setup = null, config = {}, dir = null, log = quiet } = {}) {
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'app-test-'));
  const built = await buildApp(loadConfig({}, { dataDir, port: 0, host: '127.0.0.1', ...config }), { log });
  if (setup) await setup(built);
  const server = await built.app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...built, base, dataDir, server,
    client: () => createClient(base),
    // Create an account and return a signed-in client for it.
    async user(email, role = null, password = 'correct horse battery') {
      const id = await built.auth.createUser({ email, name: email.split('@')[0], password, role: role || built.config.defaultRole });
      const c = createClient(base);
      const res = await c.post('/api/auth/login', { email, password });
      if (res.status !== 200) throw new Error(`could not sign in ${email}: ${res.status}`);
      c.id = id;
      return c;
    },
    async stop({ keep = false } = {}) {
      await built.close(server);
      if (!keep && !dir) fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

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

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
