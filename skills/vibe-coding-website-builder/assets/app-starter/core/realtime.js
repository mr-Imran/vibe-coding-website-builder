// Live updates: when one person saves, everyone looking at the same data
// sees it without reloading. Uses Server-Sent Events, which every browser
// supports and which need nothing but node:http.

import { unauthorized, tooMany } from './errors.js';

export function createHub({ heartbeatMs = 25_000, maxPerUser = 5 } = {}) {
  const clients = new Set();
  let nextId = 1;

  const timer = setInterval(() => {
    for (const c of clients) c.res.write(': keep-alive\n\n');
  }, heartbeatMs);
  timer.unref();

  return {
    // Route handler:  app.get('/api/events', hub.subscribe)
    subscribe(ctx) {
      if (!ctx.user) throw unauthorized();
      const mine = [...clients].filter((c) => c.user.id === ctx.user.id);
      if (mine.length >= maxPerUser) throw tooMany('Too many open tabs for this account.');
      ctx.handled = true;
      ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',          // tell proxies not to hold events back
      });
      ctx.res.write('retry: 3000\n\n');
      const client = { user: ctx.user, res: ctx.res };
      clients.add(client);
      ctx.req.on('close', () => clients.delete(client));
    },

    // Tell the people who are allowed to know.
    //
    //   hub.publish('booking.changed', { id, version }, { audience: (u) => u.role === 'admin' || u.id === ownerId });
    //
    // Send ids and versions, and let each page fetch the record through the
    // normal route. That way the access rules are applied in one place and a
    // live update can never show someone data they may not see.
    // audience is required on purpose: forgetting it must not mean "everyone".
    publish(type, data, { audience }) {
      if (typeof audience !== 'function') throw new Error('publish(): say who may receive this (audience: (user) => true for everyone signed in).');
      const frame = `id: ${nextId++}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      let sent = 0;
      for (const c of clients) {
        if (audience(c.user)) { c.res.write(frame); sent++; }
      }
      return sent;
    },

    get size() { return clients.size; },
    close() {
      clearInterval(timer);
      for (const c of clients) c.res.end();
      clients.clear();
    },
  };
}
