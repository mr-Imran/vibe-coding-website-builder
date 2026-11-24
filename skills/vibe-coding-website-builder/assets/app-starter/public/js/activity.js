// The activity screen, for the first role in config.js: who did what, and
// what was refused. It reads /api/activity (core/activity.js).

import { el } from './api.js';
import { ACTIONS, RULES } from './activity-words.js';
import { startPage } from './shell.js';
import { createList } from './ui.js';

await startPage('top');

// The words for each action and each rule are in js/activity-words.js, which
// belongs to the app. This file stays as it came.
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function about(line, rules = RULES) {
  // A refusal by a rule is logged as "rule: METHOD /address". Show the rule
  // in the owner's words when the app has given it some.
  const refused = line.action === 'rule.refused' && /^([\w.-]+): ([A-Z]+) (\S+)$/.exec(line.detail || '');
  if (refused) return rules[refused[1]] || `the rule "${refused[1]}" (${refused[2]} ${refused[3]})`;
  return [line.entity ? `${line.entity} ${line.entity_id ?? ''}`.trim() : null, line.detail].filter(Boolean).join(': ');
}

const list = createList({
  url: '/api/activity',
  body: document.getElementById('lines'),
  filters: document.getElementById('filters'),
  pager: document.getElementById('pager'),
  row: (line) => el('tr', {},
    el('th', { scope: 'row' }, when(line.at)),
    el('td', { 'data-label': 'Who' }, line.user_name ? `${line.user_name} (${line.user_email})` : 'Nobody signed in'),
    el('td', { 'data-label': 'What' }, ACTIONS[line.action] || line.action, line.refused ? el('span', { class: 'badge warn' }, 'refused') : null),
    el('td', { 'data-label': 'Details' }, about(line) || '-')),
  empty: (narrowed) => (narrowed ? 'Nothing matches. Try fewer words, or untick "Refused attempts only".' : 'Nothing has happened yet. Sign-ins, changes to accounts and refused attempts appear here.'),
  loaded: (data) => {
    const n = data.sums.refusedThisWeek;
    document.getElementById('refused-count').textContent = `${n} refused ${n === 1 ? 'attempt' : 'attempts'} in the last 7 days.`;
  },
});

await list.load();
