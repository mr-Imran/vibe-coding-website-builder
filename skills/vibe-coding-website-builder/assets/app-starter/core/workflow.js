// A job made of several steps, where a later step can fail after earlier
// ones have already happened (reserve the room, charge the deposit, send the
// confirmation). Every step is written down in the database as it runs, so
// the app always knows how far a job got, and each step says how to undo
// itself. When a step fails, the finished steps are undone in reverse order
// and the job ends in a clear state. Nothing is left half done.

import { now } from './db.js';

//   const bookRoom = defineWorkflow('book-room', [
//     { name: 'reserve',  run: (ctx) => ({ holdId }),   undo: (ctx, out) => releaseHold(out.holdId) },
//     { name: 'charge',   run: async (ctx) => ({...}),  undo: async (ctx, out) => refund(out), retries: 2 },
//     { name: 'confirm',  run: (ctx) => {...} },        // last step: nothing to undo after it
//   ]);
//   const run = await runWorkflow(db, bookRoom, { roomId, userId });
//   run.status -> 'completed' | 'compensated' | 'needs_attention'
//
// ctx is { input, results: { stepName: output }, runId }.
// A step's output must be plain data (it is stored as JSON).
// Write each run() so that doing it twice does no harm, because a job that
// was interrupted by a restart is continued from the step it was on.
export function defineWorkflow(name, steps) {
  const names = new Set();
  for (const s of steps) {
    if (!s.name || typeof s.run !== 'function') throw new Error(`workflow ${name}: every step needs a name and a run function`);
    if (names.has(s.name)) throw new Error(`workflow ${name}: step name "${s.name}" is used twice`);
    names.add(s.name);
  }
  return { name, steps };
}

export async function runWorkflow(db, def, input, { runKey = null } = {}) {
  // runKey makes "start this job" safe to send twice: the second call gets
  // the first run back instead of starting another.
  if (runKey) {
    const existing = db.prepare('SELECT id FROM workflow_runs WHERE name = ? AND run_key = ?').get(def.name, runKey);
    if (existing) return describe(db, existing.id);
  }
  const info = db.prepare('INSERT INTO workflow_runs (name, run_key, status, input, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(def.name, runKey, 'running', JSON.stringify(input ?? null), now(), now());
  const runId = Number(info.lastInsertRowid);
  def.steps.forEach((s, i) => {
    db.prepare('INSERT INTO workflow_steps (run_id, idx, name, status, attempts) VALUES (?, ?, ?, ?, 0)').run(runId, i, s.name, 'pending');
  });
  return advance(db, def, runId);
}

// Continue a job that stopped in the middle (for example after a restart).
export async function resumeWorkflow(db, def, runId) {
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND name = ?').get(runId, def.name);
  if (!run) throw new Error(`workflow ${def.name}: no run ${runId}`);
  if (run.status !== 'running') return describe(db, runId);
  return advance(db, def, runId);
}

// At start-up: finish or undo whatever was in flight when the app stopped.
export async function recoverWorkflows(db, defs) {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const stuck = db.prepare("SELECT id, name FROM workflow_runs WHERE status = 'running'").all();
  const out = [];
  for (const run of stuck) {
    const def = byName.get(run.name);
    if (def) out.push(await advance(db, def, run.id));
  }
  return out;
}

async function advance(db, def, runId) {
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId);
  const ctx = { input: JSON.parse(run.input), results: {}, runId };
  const rows = db.prepare('SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY idx').all(runId);
  for (const row of rows) if (row.status === 'done') ctx.results[row.name] = JSON.parse(row.output);

  for (const row of rows) {
    if (row.status === 'done') continue;
    const step = def.steps[row.idx];
    const maxAttempts = 1 + (step.retries || 0);
    let error = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      db.prepare("UPDATE workflow_steps SET status = 'running', attempts = attempts + 1, started_at = ? WHERE run_id = ? AND idx = ?").run(now(), runId, row.idx);
      try {
        const output = (await step.run(ctx)) ?? null;
        db.prepare("UPDATE workflow_steps SET status = 'done', output = ?, error = NULL, finished_at = ? WHERE run_id = ? AND idx = ?")
          .run(JSON.stringify(output), now(), runId, row.idx);
        ctx.results[step.name] = output;
        error = null;
        break;
      } catch (err) {
        error = err;
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, (step.backoffMs ?? 200) * attempt));
      }
    }
    if (error) {
      db.prepare("UPDATE workflow_steps SET status = 'failed', error = ?, finished_at = ? WHERE run_id = ? AND idx = ?")
        .run(String(error.message).slice(0, 500), now(), runId, row.idx);
      return compensate(db, def, runId, ctx, row.idx, error);
    }
  }
  db.prepare("UPDATE workflow_runs SET status = 'completed', updated_at = ? WHERE id = ?").run(now(), runId);
  return describe(db, runId);
}

async function compensate(db, def, runId, ctx, failedIdx, cause) {
  let clean = true;
  for (let i = failedIdx - 1; i >= 0; i--) {
    const step = def.steps[i];
    const row = db.prepare('SELECT * FROM workflow_steps WHERE run_id = ? AND idx = ?').get(runId, i);
    if (row.status !== 'done') continue;
    if (!step.undo) {
      db.prepare("UPDATE workflow_steps SET status = 'kept' WHERE run_id = ? AND idx = ?").run(runId, i);
      continue;
    }
    try {
      await step.undo(ctx, JSON.parse(row.output));
      db.prepare("UPDATE workflow_steps SET status = 'undone' WHERE run_id = ? AND idx = ?").run(runId, i);
    } catch (err) {
      clean = false;
      db.prepare("UPDATE workflow_steps SET status = 'undo_failed', error = ? WHERE run_id = ? AND idx = ?")
        .run(String(err.message).slice(0, 500), runId, i);
    }
  }
  // 'needs_attention' is the honest state when an undo itself failed: a person
  // has to look. It must be visible to an administrator, never hidden.
  db.prepare('UPDATE workflow_runs SET status = ?, error = ?, updated_at = ? WHERE id = ?')
    .run(clean ? 'compensated' : 'needs_attention', `${def.steps[failedIdx].name}: ${String(cause.message).slice(0, 400)}`, now(), runId);
  return describe(db, runId);
}

export function describe(db, runId) {
  const run = db.prepare('SELECT id, name, status, error, created_at, updated_at FROM workflow_runs WHERE id = ?').get(runId);
  if (!run) return null;
  run.steps = db.prepare('SELECT name, status, attempts, error FROM workflow_steps WHERE run_id = ? ORDER BY idx').all(runId);
  return run;
}
