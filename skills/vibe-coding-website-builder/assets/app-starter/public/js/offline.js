// Working without a connection (only for apps that ask for it).
//
// Three parts:
//  1. sw.js keeps the pages and scripts on the device, so the app opens offline.
//  2. Records the person has seen are kept in the device's storage, so there
//     is something to look at and edit.
//  3. Edits made offline go into an outbox (js/merge.js) and are sent when the
//     connection returns. If someone else changed the same record meanwhile,
//     the person is asked what to keep. Nothing is overwritten silently.
//
// Service workers need https or localhost. They do not run from a file opened
// by double-click.

import { api } from './api.js';
import { createOutbox } from './merge.js';

const DB_NAME = 'app-offline';
const STORES = ['outbox', 'cache'];

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { for (const s of STORES) req.result.createObjectStore(s, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function table(name) {
  const run = async (mode, work) => {
    const db = await openStore();
    return new Promise((resolve, reject) => {
      const t = db.transaction(name, mode);
      const request = work(t.objectStore(name));
      t.oncomplete = () => resolve(request ? request.result : undefined);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    all: () => run('readonly', (s) => s.getAll()),
    get: (id) => run('readonly', (s) => s.get(id)),
    put: (entry) => run('readwrite', (s) => { s.put(entry); }),
    remove: (id) => run('readwrite', (s) => { s.delete(id); }),
  };
}

// Records kept on the device: cache.put({ id: 'booking:12', record }) after each successful load.
export const cache = table('cache');

// onConflict(entry, current) must ask the person and answer 'mine', 'theirs' or { merged }.
// onChange(report) is called after each attempt to send, to update the screen.
export function startOffline({ onConflict, onChange = () => {} }) {
  const outbox = createOutbox({
    store: table('outbox'),
    send: (entry) => api(entry.method, entry.url, entry.body, { idempotencyKey: entry.key }),
    onConflict,
  });
  const flush = async () => { if (navigator.onLine) onChange(await outbox.flush()); };
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  flush();

  return {
    // Use instead of api() for saves that should survive being offline.
    // Answers { queued: false, result } when it went through at once, or
    // { queued: true } when it is waiting in the outbox.
    async save({ method, url, body, base = null, fields = [] }) {
      if (navigator.onLine && (await outbox.pending()) === 0) {
        try { return { queued: false, result: await api(method, url, body) }; }
        catch (err) { if (!err.offline) throw err; }
      }
      await outbox.add({ method, url, body, base, fields });
      onChange({ sent: 0, kept: await outbox.pending(), conflicts: 0, dropped: [] });
      return { queued: true };
    },
    pending: outbox.pending,
    flush,
  };
}
