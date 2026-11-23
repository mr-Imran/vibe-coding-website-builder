// What happened, and what was refused: the audit log as a list for the first
// role in config.js. Every app with private records needs this screen (A03
// asks for it), so it comes with the starter, like the backup.
//
// What the core writes to the log, as `action`:
//   auth.login, auth.login_failed, auth.signup, auth.password_changed
//   auth.denied      a signed-in person called a route their role may not use
//   access.denied    guardRecord() refused: a record that is not theirs
//   rule.refused     a refusal that named its rule: conflict('...', { rule: 'max_open' })
//   user.created, user.changed, user.password_set
//   backup.downloaded, seed.loaded
// A module adds its own lines with audit() from core/policy.js (a booking
// made, a member approved); give them words in public/js/activity.js.
//
// A refusal that does not name a rule is not logged. If the app promises
// that staff can see every refused attempt, every refusal has to name one.

import { listQuery } from './records.js';

export function registerActivity(app, { db, config, auth }) {
  app.get('/api/activity', auth.requireRole(config.roles[0]), (ctx) => {
    // The log is stamped by the real clock (see "two clocks" in the guide),
    // so "the last 7 days" is counted from the real clock too.
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    return listQuery(db, {
      table: 'activity_list', query: ctx.query,
      search: { q: ctx.query.q, columns: ['user_name', 'user_email', 'action', 'detail'] },
      filters: {
        refused: { check: { type: 'bool', label: 'Refused only' }, where: (on) => (on ? { sql: 'refused = 1' } : null) },
        from: { column: 'at', op: '>=', check: { type: 'date', label: 'From' } },
      },
      sortable: ['at', 'action', 'user_name'], defaultSort: '-at',
      sums: {
        refused: { count: 'refused = 1' },
        refusedThisWeek: { count: 'refused = 1 AND at >= ?', params: [weekAgo] },
      },
    });
  });
}
