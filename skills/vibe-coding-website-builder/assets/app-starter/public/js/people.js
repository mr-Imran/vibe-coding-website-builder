// The administrator's screen for accounts: add people, change roles, switch
// an account off, and set a new password for someone who is locked out.

import { announce, api, el, showFieldErrors, withBusy } from './api.js';
import { startPage } from './shell.js';

const me = await startPage(['admin']);
const { roles } = await api('GET', '/api/auth/me');
const body = document.getElementById('people');
const form = document.getElementById('add-form');

form.elements.role.replaceChildren(...roles.map((r) => el('option', { value: r }, r)));
form.elements.role.value = roles[roles.length - 1];

async function change(id, patch, done) {
  try {
    await api('PATCH', `/api/users/${id}`, patch);
    announce(done);
  } catch (err) {
    announce(err.message);
  }
  await load();
}

async function setPassword(person) {
  const next = prompt(`New password for ${person.name} (at least 8 characters). They will be signed out everywhere.`);
  if (!next) return;
  try {
    await api('POST', `/api/users/${person.id}/password`, { next });
    announce(`${person.name} has a new password. Give it to them privately.`);
  } catch (err) {
    announce(err.fields ? Object.values(err.fields).join(' ') : err.message);
  }
}

async function load() {
  let users;
  try {
    ({ users } = await api('GET', '/api/users'));
  } catch (err) {
    body.replaceChildren(el('tr', {}, el('td', { colspan: '5' }, `${err.message} `, el('button', { type: 'button', class: 'link', onclick: load }, 'Try again'))));
    return;
  }
  body.replaceChildren(...users.map((person) => {
    const role = el('select', { 'aria-label': `Role of ${person.name}` }, roles.map((r) => el('option', { value: r, selected: r === person.role }, r)));
    role.addEventListener('change', () => change(person.id, { role: role.value }, `${person.name} is now ${role.value}.`));
    const active = el('input', { type: 'checkbox', checked: person.active === 1, 'aria-label': `${person.name} can sign in` });
    active.addEventListener('change', () => change(person.id, { active: active.checked }, `${person.name} ${active.checked ? 'can sign in again' : 'can no longer sign in'}.`));
    return el('tr', {},
      el('th', { scope: 'row' }, person.name, person.id === me.id ? ' (you)' : ''),
      el('td', {}, person.email),
      el('td', {}, role),
      el('td', {}, active),
      el('td', {}, el('button', { type: 'button', class: 'link', onclick: () => setPassword(person) }, 'Set a new one')));
  }));
}

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
      await load();
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
});

await load();
