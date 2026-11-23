import { api, loadSession, showFieldErrors, withBusy } from './api.js';

const form = document.getElementById('auth-form');
const submit = document.getElementById('submit');
const switcher = document.getElementById('switch');
let mode = 'login';
// The app's name is written in the pages, not here: keep whatever follows
// the dash in this page's own title.
const appName = document.title.includes(' - ') ? document.title.slice(document.title.indexOf(' - ') + 3) : '';

// Only ever go back to a page of this app after signing in.
const next = new URLSearchParams(location.search).get('next');
const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

if (await loadSession()) location.href = target;

// May people create their own account here, and is there any account yet?
let state = { signup: true, firstAccountNeeded: false };
try { state = await api('GET', '/api/auth/state'); } catch { /* the form still works without it */ }
document.getElementById('first-account').hidden = !state.firstAccountNeeded;
switcher.hidden = !state.signup || state.firstAccountNeeded;
const signupNote = document.getElementById('signup-note');

function setMode(value) {
  mode = value;
  const signup = mode === 'signup';
  document.getElementById('title').textContent = signup ? 'Create an account' : 'Sign in';
  const heading = signup ? 'Create an account' : 'Sign in';
  document.title = appName ? `${heading} - ${appName}` : heading;
  document.getElementById('name-field').hidden = !signup;
  signupNote.hidden = !signup || !signupNote.textContent.trim();
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
