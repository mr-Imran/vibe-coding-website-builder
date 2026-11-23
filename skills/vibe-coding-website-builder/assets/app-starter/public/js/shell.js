// The part every signed-in page shares: who is signed in, the menu, sign out.
//
//   const user = await startPage();              any signed-in user
//   const user = await startPage(['staff']);     only these roles; others are sent home
//   const user = await startPage('top');         only the first role in config.js
//
// Add the app's own pages to MENU. A page listed with roles is only shown to
// those roles. That is for tidiness; the routes are what protect the data.
// 'top' means the first role in config.js, so renaming the roles there does
// not lock anyone out of the People screen.

import { allows, api, el, fill, requireSession } from './api.js';

const MENU = [
  { href: '/', label: 'Home' },
  // { href: '/classes', label: 'Classes' },
  // { href: '/reports', label: 'Reports', roles: ['staff', 'manager'] },
  { href: '/people', label: 'People', roles: 'top' },
  { href: '/account', label: 'Your account' },
];

export async function startPage(roles = null) {
  const user = await requireSession(roles);
  const nav = document.getElementById('nav');
  if (nav) {
    const here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    fill(nav, MENU.filter((m) => allows(m.roles, user.role)).map((m) =>
      el('a', { href: m.href, 'aria-current': m.href === here ? 'page' : null }, m.label)));
  }
  const who = document.getElementById('who-name');
  if (who) who.textContent = `${user.name} (${user.role})`;
  const out = document.getElementById('sign-out');
  if (out) {
    out.addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      location.href = '/login';
    });
  }
  return user;
}
