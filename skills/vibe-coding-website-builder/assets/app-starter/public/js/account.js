import { announce, api, showFieldErrors, withBusy } from './api.js';
import { startPage } from './shell.js';

const user = await startPage();
document.getElementById('who-email').textContent = `Signed in as ${user.email}.`;

const form = document.getElementById('password-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  withBusy(document.getElementById('save-password'), async () => {
    try {
      await api('POST', '/api/auth/password', { current: form.elements.current.value, next: form.elements.next.value });
      showFieldErrors(form, { fields: {} });
      form.reset();
      announce('Your password is changed.');
    } catch (err) {
      announce('');
      showFieldErrors(form, err);
    }
  });
});
