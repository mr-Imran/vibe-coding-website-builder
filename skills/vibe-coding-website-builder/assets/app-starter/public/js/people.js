// The screen for accounts, for the first role in config.js: find people,
// add them, change roles, switch an account off, set a new password for
// someone who is locked out, and download a backup.
//
// It is also the example to copy for a list (createList) and for a question
// asked in the page (ask), both from ui.js.

import { allRoles, announce, api, el, fill, showFieldErrors, withBusy } from './api.js';
import { startPage } from './shell.js';
import { ask, createList } from './ui.js';

const me = await startPage('top');
const roles = allRoles();
const form = document.getElementById('add-form');
const filters = document.getElementById('filters');
const dialog = document.getElementById('password-dialog');
const passwordForm = document.getElementById('password-form');
let passwordFor = null;

fill(form.elements.role, roles.map((r) => el('option', { value: r }, r)));
form.elements.role.value = roles[roles.length - 1];
fill(filters.elements.role, el('option', { value: '' }, 'All roles'), roles.map((r) => el('option', { value: r }, r)));

async function change(id, patch, done) {
  try {
    await api('PATCH', `/api/users/${id}`, patch);
    announce(done);
  } catch (err) {
    announce(err.message, 'error');
  }
  await list.load();
}

function askForPassword(person) {
  passwordFor = person;
  passwordForm.reset();
  showFieldErrors(passwordForm, { fields: {} });
  document.getElementById('password-for').textContent = `For ${person.name} (${person.email}). They will be signed out everywhere.`;
  dialog.showModal();
}

document.getElementById('cancel-password').addEventListener('click', () => dialog.close());

passwordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  withBusy(document.getElementById('save-password'), async () => {
    try {
      await api('POST', `/api/users/${passwordFor.id}/password`, { next: passwordForm.elements.next.value });
      dialog.close();
      announce(`${passwordFor.name} has a new password. Give it to them privately.`);
    } catch (err) {
      showFieldErrors(passwordForm, err);
    }
  });
});

function personRow(person) {
  const role = el('select', { 'aria-label': `Role of ${person.name}` }, roles.map((r) => el('option', { value: r, selected: r === person.role }, r)));
  role.addEventListener('change', () => change(person.id, { role: role.value }, `${person.name} is now ${role.value}.`));
  const active = el('input', { type: 'checkbox', checked: person.active === 1, 'aria-label': `${person.name} can sign in` });
  active.addEventListener('change', async () => {
    if (!active.checked) {
      const sure = await ask({
        title: `Switch off ${person.name}'s account?`,
        text: 'They are signed out at once and cannot sign in until you switch it on again. Nothing of theirs is deleted.',
        yes: 'Switch it off', danger: true,
      });
      if (!sure) { active.checked = true; return; }
    }
    await change(person.id, { active: active.checked }, `${person.name} ${active.checked ? 'can sign in again' : 'can no longer sign in'}.`);
  });
  // data-label is what a phone shows beside each value, where the table
  // becomes one card per person (see table.stack in app.css).
  return el('tr', {},
    el('th', { scope: 'row' }, person.name, person.id === me.id ? ' (you)' : null),
    el('td', { 'data-label': 'Email' }, person.email),
    el('td', { 'data-label': 'Role' }, role),
    el('td', { 'data-label': 'Can sign in' }, active),
    el('td', { 'data-label': 'Password' }, el('button', { type: 'button', class: 'link', onclick: () => askForPassword(person) }, 'Set a new one')));
}

const list = createList({
  url: '/api/users',
  body: document.getElementById('people'),
  filters,
  pager: document.getElementById('pager'),
  row: personRow,
  empty: (narrowed) => (narrowed ? 'Nobody matches. Try fewer words, or set the choices back to "All".' : 'Nobody has an account yet. Add the first person below.'),
  // A figure worked out by the database over everyone who matches, not just this page.
  loaded: (data) => {
    document.getElementById('people-count').textContent = data.total
      ? `${data.total} ${data.total === 1 ? 'person' : 'people'}, ${data.sums.canSignIn} of them can sign in.`
      : '';
  },
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  withBusy(document.getElementById('add'), async () => {
    const f = form.elements;
    try {
      await api('POST', '/api/users', { name: f.name.value, email: f.email.value, role: f.role.value, password: f.password.value });
      showFieldErrors(form, { fields: {} });
      const added = f.name.value;
      form.reset();
      f.role.value = roles[roles.length - 1];
      announce(`${added} was added.`);
      await list.load();
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
});

await list.load();
