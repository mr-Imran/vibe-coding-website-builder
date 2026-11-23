// The screen for accounts, for the first role in config.js: add people,
// change roles, switch an account off, set a new password for someone who is
// locked out, and download a backup.

import { allRoles, announce, api, el, showFieldErrors, withBusy } from './api.js';
import { startPage } from './shell.js';

const me = await startPage('top');
const roles = allRoles();
const body = document.getElementById('people');
const form = document.getElementById('add-form');
const dialog = document.getElementById('password-dialog');
const passwordForm = document.getElementById('password-form');
let passwordFor = null;

form.elements.role.replaceChildren(...roles.map((r) => el('option', { value: r }, r)));
form.elements.role.value = roles[roles.length - 1];

async function change(id, patch, done) {
  try {
    await api('PATCH', `/api/users/${id}`, patch);
    announce(done);
  } catch (err) {
    announce(err.message, 'error');
  }
  await load();
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
    // data-label is what a phone shows beside each value, where the table
    // becomes one card per person (see table.stack in app.css).
    return el('tr', {},
      el('th', { scope: 'row' }, person.name, person.id === me.id ? ' (you)' : ''),
      el('td', { 'data-label': 'Email' }, person.email),
      el('td', { 'data-label': 'Role' }, role),
      el('td', { 'data-label': 'Can sign in' }, active),
      el('td', { 'data-label': 'Password' }, el('button', { type: 'button', class: 'link', onclick: () => askForPassword(person) }, 'Set a new one')));
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
