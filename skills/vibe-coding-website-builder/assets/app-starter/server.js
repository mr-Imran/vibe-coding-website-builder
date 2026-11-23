// Start the app:  node server.js   then open http://localhost:3000
//
// buildApp() is separate from listening so the tests can start the same app
// on a spare port with a throw-away database.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createAuth } from './core/auth.js';
import { migrate, openDb } from './core/db.js';
import { createApp } from './core/http.js';
import { forgetOldKeys } from './core/idempotency.js';
import { createHub } from './core/realtime.js';
import { recoverWorkflows } from './core/workflow.js';
import { registerModules, workflows } from './modules/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(config = loadConfig(), { log = console } = {}) {
  const dbFile = config.dbFile || path.join(config.dataDir, 'app.db');
  const db = openDb(dbFile);
  migrate(db, path.join(here, 'migrations'));

  const auth = createAuth({ db, config });
  const hub = createHub();
  const app = createApp({ db, config, auth, log, publicDir: path.join(here, 'public') });

  auth.registerRoutes(app);
  app.get('/api/events', hub.subscribe);
  app.get('/api/health', () => ({ ok: true }));           // hosts call this to see that the app is up
  registerModules(app, { db, config, auth, hub });

  if (await auth.bootstrapAdmin()) log.log(`Created the administrator account for ${config.adminEmail}.`);
  forgetOldKeys(db);
  // Jobs that were in the middle of something when the app last stopped.
  const recovered = await recoverWorkflows(db, workflows);
  if (recovered.length) log.log(`Finished or undid ${recovered.length} interrupted job(s).`);

  return {
    app, db, auth, hub, config,
    async close(server) {
      hub.close();
      if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
      db.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const built = await buildApp(config);
  const server = await built.app.listen();
  console.log(`${config.appName} is running: http://localhost:${server.address().port}`);
  const stop = async () => { await built.close(server); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
