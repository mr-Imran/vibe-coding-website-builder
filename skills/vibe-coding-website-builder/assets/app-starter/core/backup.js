// A copy of the whole database, for the first role in config.js to download.
//
// Everything the app holds is one file. A host can lose it and a mistaken
// update can damage it, so the People screen has a "Download a backup"
// button that calls this route. The copy is made with VACUUM INTO, which
// gives a complete, consistent file even while people are using the app.
//
// The file contains everyone's records and password hashes (not passwords,
// and not working sessions). Whoever downloads it must keep it private.
//
// To go back to a backup: stop the app, replace data/app.db with the
// downloaded file (renamed to app.db), delete app.db-wal and app.db-shm if
// they are there, and start the app again.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit } from './policy.js';

export function registerBackup(app, { db, config, auth }) {
  app.get('/api/backup', auth.requireRole(config.roles[0]), (ctx) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-backup-'));
    const file = path.join(dir, 'backup.db');
    const tidy = () => fs.rm(dir, { recursive: true, force: true }, () => {});
    try {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    } catch (err) {
      tidy();
      throw err;
    }
    audit(db, { userId: ctx.user.id, action: 'backup.downloaded', ip: ctx.ip });

    const day = new Date().toISOString().slice(0, 10);
    const name = `${String(config.appName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'}-backup-${day}.db`;
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', 'application/octet-stream');
    ctx.res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    ctx.res.setHeader('Content-Length', fs.statSync(file).size);
    ctx.handled = true;
    const stream = fs.createReadStream(file);
    stream.on('close', tidy);
    stream.on('error', () => { tidy(); ctx.res.destroy(); });
    stream.pipe(ctx.res);
  });
}
