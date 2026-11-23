// The activity screen, for the first role in config.js: who did what, and
// what was refused. It reads /api/activity (core/activity.js).

import { el } from './api.js';
import { startPage } from './shell.js';
import { createList } from './ui.js';

await startPage('top');

// What each line in the log means, in plain words. Add the app's own actions
// here (the ones its modules write with audit()); a line without words is
// shown by its action name.
const WORDS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'A sign-in failed',
  'auth.signup': 'Created their own account',
  'auth.password_changed': 'Changed their own password',
  'auth.denied': 'Tried something their role may not do',
  'access.denied': 'Tried to reach a record that is not theirs',
  'rule.refused': 'Was refused by a rule',
  'user.created': 'Added an account',
  'user.changed': 'Changed an account',
  'user.password_set': 'Set a new password for someone',
  'backup.downloaded': 'Downloaded a backup',
  'seed.loaded': 'Example data was loaded',
};

const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const about = (line) => [line.entity ? `${line.entity} ${line.entity_id ?? ''}`.trim() : null, line.detail].filter(Boolean).join(': ');

const list = createList({
  url: '/api/activity',
  body: document.getElementById('lines'),
  filters: document.getElementById('filters'),
  pager: document.getElementById('pager'),
  row: (line) => el('tr', {},
    el('th', { scope: 'row' }, when(line.at)),
    el('td', { 'data-label': 'Who' }, line.user_name ? `${line.user_name} (${line.user_email})` : 'Nobody signed in'),
    el('td', { 'data-label': 'What' }, WORDS[line.action] || line.action, line.refused ? el('span', { class: 'badge warn' }, 'refused') : null),
    el('td', { 'data-label': 'Details' }, about(line) || '-')),
  empty: (narrowed) => (narrowed ? 'Nothing matches. Try fewer words, or untick "Refused attempts only".' : 'Nothing has happened yet. Sign-ins, changes to accounts and refused attempts appear here.'),
  loaded: (data) => {
    const n = data.sums.refusedThisWeek;
    document.getElementById('refused-count').textContent = `${n} refused ${n === 1 ? 'attempt' : 'attempts'} in the last 7 days.`;
  },
});

await list.load();
