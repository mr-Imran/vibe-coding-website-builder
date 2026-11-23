import { api, loadSession, showFieldErrors, withBusy } from './api.js';

const form = document.getElementById('auth-form');
const submit = document.getElementById('submit');
const switcher = document.getElementById('switch');
let mode = 'login';

// Only ever go back to a page of this app after signing in.
const next = new URLSearchParams(location.search).get('next');
const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

if (await loadSession()) location.href = target;

function setMode(value) {
  mode = value;
  const signup = mode === 'signup';
  document.getElementById('title').textContent = signup ? 'Create an account' : 'Sign in';
  document.title = `${signup ? 'Create an account' : 'Sign in'} - My app`;
  document.getElementById('name-field').hidden = !signup;
  document.getElementById('password-hint').hidden = !signup;
  document.getElementById('password').autocomplete = signup ? 'new-password' : 'current-password';
  submit.textContent = signup ? 'Create account' : 'Sign in';
  submit.dataset.busy = signup ? 'Creating…' : 'Signing in…';
  switcher.textContent = signup ? 'I already have an account' : 'Create an account';
}
switcher.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  withBusy(submit, async () => {
    const data = { email: form.elements.email.value, password: form.elements.password.value };
    if (mode === 'signup') data.name = form.elements.name.value;
    try {
      await api('POST', mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', data);
      location.href = target;
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
});
