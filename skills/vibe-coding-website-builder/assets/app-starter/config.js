// Settings. Anything secret or different between your computer and the live
// app comes from the environment, never from a file in this folder.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env, overrides = {}) {
  const production = env.NODE_ENV === 'production';
  const flag = (name, fallback) => (env[name] === undefined ? fallback : env[name] === '1' || env[name] === 'true');
  return {
    production,
    port: Number(env.PORT || 3000),
    // Hosts need the app to listen on every network interface; on your own
    // computer it stays private to that computer.
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    // Where the database file lives. On a host this must be a folder that
    // survives restarts (a "volume" or "disk"), or all data is lost on redeploy.
    // A relative folder is taken from the app's own folder, so starting the app
    // from somewhere else does not quietly create a second, empty database.
    dataDir: path.resolve(here, env.DATA_DIR || 'data'),
    appName: 'My app',
    // Where the business is. Rules such as "has the 9 o'clock class started?"
    // are about the clock on the wall there, not on the host. See core/time.js.
    timeZone: env.TIME_ZONE || 'UTC',
    // The current moment. Rules ask config.now() instead of new Date(), so a
    // test can set the clock to "five minutes before the deadline".
    now: () => new Date(),
    // Roles, most powerful first. The first one manages people.
    roles: ['admin', 'member'],
    defaultRole: 'member',
    allowSignup: flag('ALLOW_SIGNUP', true),
    sessionDays: Number(env.SESSION_DAYS || 7),
    sessionIdleHours: Number(env.SESSION_IDLE_HOURS || 24),
    // Live apps are served over https, so cookies are marked https-only there.
    secureCookies: flag('SECURE_COOKIES', production),
    // Behind a host's proxy the visitor's address arrives in a header.
    trustProxy: flag('TRUST_PROXY', production),
    appOrigin: env.APP_ORIGIN || '',
    maxBodyBytes: 100_000,
    // Used once, on the first start with an empty database, to create the
    // administrator. Set both on the host; change the password after signing in.
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    ...overrides,
  };
}
