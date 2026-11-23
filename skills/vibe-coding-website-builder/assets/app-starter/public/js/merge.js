// Deciding what to do when two people changed the same record.
// Plain functions with no browser in them, so the tests can run them.

// base: the record as both people first saw it
// mine: my edited copy            theirs: the copy now on the server
// fields: the fields a person can edit
//
// A field only one side changed is taken from that side. A field both sides
// changed to different values is a real conflict: it is listed, and the
// merged copy keeps the server's value until a person chooses.
export function threeWayMerge(base, mine, theirs, fields) {
  const merged = { ...theirs };
  const conflicts = [];
  const fromMine = [];
  for (const f of fields) {
    const iChanged = !same(mine[f], base[f]);
    const theyChanged = !same(theirs[f], base[f]);
    if (iChanged && theyChanged && !same(mine[f], theirs[f])) conflicts.push({ field: f, base: base[f], mine: mine[f], theirs: theirs[f] });
    else if (iChanged) { merged[f] = mine[f]; fromMine.push(f); }
  }
  return { merged, conflicts, fromMine, clean: conflicts.length === 0 };
}

const same = (a, b) => (a ?? null) === (b ?? null) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The offline outbox: actions taken without a connection, kept in order and
// sent when the connection is back.
//
//   store: { all(): Promise<[entry]>, put(entry): Promise, remove(id): Promise }   (IndexedDB in the browser, memory in tests)
//   send:  (entry) => Promise<result>, throwing an error with .status (0 = still offline) and .current on a 409
//   onConflict: (entry, current) => Promise<'mine' | 'theirs' | { merged }>   the person's choice
//
// Each entry keeps the idempotency key it was created with, so an action whose
// answer was lost on a bad connection is not carried out twice when resent.
export function createOutbox({ store, send, onConflict, makeId = () => crypto.randomUUID() }) {
  let flushing = null;

  async function add({ method, url, body, base = null, fields = [] }) {
    const entry = { id: makeId(), key: makeId(), at: Date.now(), method, url, body, base, fields, tries: 0 };
    await store.put(entry);
    return entry;
  }

  async function flushOnce() {
    const report = { sent: 0, kept: 0, conflicts: 0, dropped: [] };
    const entries = (await store.all()).sort((a, b) => a.at - b.at);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        await send(entry);
        await store.remove(entry.id);
        report.sent++;
      } catch (err) {
        if (!err.status) { report.kept = entries.length - i; break; }      // still offline: keep the rest in order
        if (err.status === 409 && err.current) {
          report.conflicts++;
          const choice = await onConflict(entry, err.current);
          if (choice === 'theirs') { await store.remove(entry.id); continue; }
          // Try again on top of the server's copy, with a new key because it is a new action.
          const body = choice === 'mine' ? { ...entry.body, version: err.current.version } : { ...choice.merged, version: err.current.version };
          const retry = { ...entry, body, base: err.current, key: makeId(), tries: entry.tries + 1 };
          if (retry.tries > 3) {
            // The record keeps changing under us. Stop, and let the person look.
            await store.remove(entry.id);
            report.dropped.push({ entry, reason: 'This record kept changing while your edit was being saved.' });
            continue;
          }
          await store.put(retry);                      // same id: replaces the old entry
          entries.splice(i + 1, 0, retry);
          continue;
        }
        // Refused for another reason (no longer allowed, no longer valid):
        // keeping it would block everything behind it. Tell the person.
        await store.remove(entry.id);
        report.dropped.push({ entry, reason: err.message });
      }
    }
    return report;
  }

  return {
    add,
    pending: async () => (await store.all()).length,
    // One flush at a time; a second call while one is running waits for it.
    flush() { flushing ??= flushOnce().finally(() => { flushing = null; }); return flushing; },
  };
}

export function memoryStore() {
  const map = new Map();
  return {
    all: async () => [...map.values()],
    put: async (entry) => { map.set(entry.id, entry); },
    remove: async (id) => { map.delete(id); },
  };
}
