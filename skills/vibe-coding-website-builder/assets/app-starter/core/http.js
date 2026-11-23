// The web server: routes, request bodies, static files, safe defaults.
// Built on node:http only.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError, badRequest, forbidden, notFound, unauthorized } from './errors.js';
import { audit } from './policy.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp({ db, config, publicDir, auth = null, log = console }) {
  const routes = [];

  function add(method, pattern, args) {
    const opts = typeof args[0] === 'object' && args[0] !== null ? args.shift() : {};
    const handler = args.pop();
    const names = [];
    const source = pattern.replace(/:([a-zA-Z_]+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), names, guards: args, handler, opts, pattern });
  }

  const app = {
    db, config, routes,
    auth,
    // app.get('/api/things/:id', guard, guard, handler)
    // app.post('/api/login', { public: true }, handler)   public: no session and no CSRF token needed
    get: (p, ...a) => add('GET', p, a),
    post: (p, ...a) => add('POST', p, a),
    put: (p, ...a) => add('PUT', p, a),
    patch: (p, ...a) => add('PATCH', p, a),
    delete: (p, ...a) => add('DELETE', p, a),
    handle,
    listen(port = config.port, host = config.host) {
      const server = http.createServer(handle);
      server.requestTimeout = 30_000;
      server.headersTimeout = 15_000;
      // A port that is already taken is reported to the caller (server.js
      // turns it into a sentence) and not thrown as a raw crash.
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(server); });
      });
    },
  };

  async function handle(req, res) {
    const requestId = randomUUID().slice(0, 8);
    setSecurityHeaders(res, config);
    let ctx = null;
    try {
      const url = new URL(req.url, 'http://local');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw badRequest('Bad address.'); }
      if (pathname.includes('\0')) throw badRequest('Bad address.');
      if (!pathname.startsWith('/api/')) return await serveStatic(req, res, pathname);

      res.setHeader('Cache-Control', 'no-store');
      const match = findRoute(req.method, pathname);
      if (!match) throw notFound();
      ctx = makeContext(req, res, url, match.params, requestId);

      const found = auth ? auth.loadSession(req) : null;
      if (found) { ctx.user = found.user; ctx.session = found.session; }

      if (UNSAFE.has(req.method)) {
        checkOrigin(req, config);
        if (!match.route.opts.public) {
          if (!ctx.session) throw unauthorized();
          checkCsrf(req, ctx.session);
        }
      }
      for (const guard of match.route.guards) await guard(ctx);
      const result = await match.route.handler(ctx);
      if (ctx.handled || res.writableEnded) return;
      if (result === undefined || result === null) return sendJson(res, 204);
      return sendJson(res, ctx.statusCode || 200, result);
    } catch (err) {
      if (res.headersSent) { res.end(); return; }
      if (err instanceof HttpError) {
        // A refusal that names its rule (conflict('...', { rule: 'max_open' }))
        // is written to the audit log, so "what was refused, and to whom" can
        // be answered later. It is written here, after any transaction the
        // refusal came out of has been rolled back.
        if (ctx && err.extra && err.extra.rule && (err.status === 403 || err.status === 409)) {
          try {
            audit(db, { userId: ctx.user ? ctx.user.id : null, action: 'rule.refused', detail: `${err.extra.rule}: ${req.method} ${req.url.split('?')[0]}`, ip: ctx.ip });
          } catch (failed) { log.error(`[${requestId}] could not log a refusal`, failed); }
        }
        return sendJson(res, err.status, { error: { code: err.code, message: err.message, ...err.extra } });
      }
      log.error(`[${requestId}] ${req.method} ${req.url}`, err);
      return sendJson(res, 500, { error: { code: 'server_error', message: `Something went wrong on our side. Reference: ${requestId}` } });
    }
  }

  function findRoute(method, pathname) {
    let pathMatched = false;
    for (const route of routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.names.forEach((name, i) => { params[name] = m[i + 1]; });
      return { route, params };
    }
    if (pathMatched) throw new HttpError(405, 'method_not_allowed', 'That action is not available here.');
    return null;
  }

  function makeContext(req, res, url, params, requestId) {
    let parsed;
    const ctx = {
      req, res, params, requestId, db, config,
      query: Object.fromEntries(url.searchParams),
      user: null, session: null, handled: false, statusCode: 0,
      ip: clientIp(req, config),
      status(code) { ctx.statusCode = code; return ctx; },
      // The JSON body, read once. Anything that is not JSON is refused.
      async body() {
        if (parsed !== undefined) return parsed;
        const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/json') throw new HttpError(415, 'unsupported', 'Send the details as JSON.');
        const raw = await readBody(req, config.maxBodyBytes || 100_000);
        let value;
        try { value = raw.length ? JSON.parse(raw) : {}; }
        catch { throw badRequest('The details could not be read.'); }
        // null, a list or a bare number would crash code that reads fields from it.
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw badRequest('Send the details as an object.');
        parsed = value;
        return parsed;
      },
      // A plain-text body such as an uploaded CSV file.
      async text(limit = 5_000_000, types = ['text/csv', 'text/plain']) {
        const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!types.includes(type)) throw new HttpError(415, 'unsupported', `Send the file as ${types[0]}.`);
        return readBody(req, limit);
      },
    };
    return ctx;
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'That action is not available here.' } });
    }
    let rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    if (!path.extname(rel)) rel += '.html';                     // /login -> /login.html
    const file = path.join(publicDir, path.normalize(rel));
    const inside = file.startsWith(publicDir + path.sep);
    let stat = null;
    if (inside) { try { stat = await fs.promises.stat(file); } catch { /* missing */ } }
    if (!stat || !stat.isFile()) {
      const fallback = path.join(publicDir, '404.html');
      res.statusCode = 404;
      res.setHeader('Content-Type', TYPES['.html']);
      if (fs.existsSync(fallback)) return fs.createReadStream(fallback).pipe(res);
      return res.end('<!doctype html><title>Not found</title><h1>Page not found</h1><p><a href="/">Back to the start</a></p>');
    }
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    // Scripts, styles and pictures: the browser may keep a copy but must ask
    // whether it is still current. Without this, people keep running last
    // week's scripts after an update and report that "nothing changed".
    // Pages are not kept at all. A page a browser keeps is one it can show
    // again on the Back button after the person has signed out; see
    // reloadWhenRestored() in public/js/api.js for the other half of this.
    res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'no-cache');
    const modified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000);
    res.setHeader('Last-Modified', modified.toUTCString());
    const since = Date.parse(req.headers['if-modified-since'] || '');
    if (!Number.isNaN(since) && since >= modified.getTime()) { res.statusCode = 304; return res.end(); }
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  return app;
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  if (status === 204 || data === undefined) return res.end();
  const body = JSON.stringify(data);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  return res.end(body);
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, 'too_large', 'That is too much data to send at once.'));
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'too_large', 'That is too much data to send at once.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function setSecurityHeaders(res, config) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  // Scripts and styles only from the app's own files: injected markup cannot run code.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// A request that changes something must come from the app's own pages.
function checkOrigin(req, config) {
  const origin = req.headers.origin;
  if (!origin) return;                       // not a browser, or a same-origin request without the header
  let host;
  try { host = new URL(origin).host; } catch { throw forbidden('This request came from somewhere unexpected.'); }
  const expected = config.appOrigin ? new URL(config.appOrigin).host : req.headers.host;
  if (host !== expected) throw forbidden('This request came from somewhere unexpected.');
}

function checkCsrf(req, session) {
  const sent = Buffer.from(String(req.headers['x-csrf-token'] || ''));
  const expected = Buffer.from(session.csrf);
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    throw forbidden('Your session could not be confirmed. Reload the page and try again.');
  }
}

export function clientIp(req, config) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}
