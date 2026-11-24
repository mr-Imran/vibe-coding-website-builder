// Which ports the tests and the browser tools may use. Normally any spare
// port. On a computer where programs must stay within a range of ports, set
// PORTS before running them:
//
//   PORTS=3800-3899 node --test          (Windows PowerShell: $env:PORTS = '3800-3899'; node --test)
//
// The app itself is not affected: it uses PORT, or 3000.

import net from 'node:net';

// The range in PORTS as [first, last], or null when it is not set.
export function portRange(env = process.env) {
  const text = (env.PORTS || '').trim();
  if (!text) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(text);
  const range = m ? [Number(m[1]), Number(m[2])] : null;
  if (!range || range[0] < 1 || range[1] > 65535 || range[0] > range[1]) {
    throw new Error(`PORTS="${text}" is not a range of ports such as 3800-3899.`);
  }
  return range;
}

// Run listen(port) on a spare port and return what it returns. listen must
// reject with code EADDRINUSE when the port is taken; the next one is tried.
// Without PORTS it is called once with 0, and the system picks the port.
export async function onSparePort(listen, env = process.env) {
  const range = portRange(env);
  if (!range) return listen(0);
  const [first, last] = range;
  const span = last - first + 1;
  // Start somewhere random, so programs started at the same moment (the test
  // files run side by side) do not all queue for the same port.
  const start = Math.floor(Math.random() * span);
  for (let i = 0; i < span; i++) {
    const port = first + ((start + i) % span);
    try {
      return await listen(port);
    } catch (err) {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
    }
  }
  throw new Error(`Every port from ${first} to ${last} (PORTS) is taken.`);
}

// A port that is free now, for a program started separately (the app in
// tools/look.js, the browser). Another program could take it in between; the
// moment is short.
export function freePort(env = process.env) {
  return onSparePort((port) => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => { const got = probe.address().port; probe.close(() => resolve(got)); });
  }), env);
}
