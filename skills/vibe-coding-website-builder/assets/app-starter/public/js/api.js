// How pages talk to the server. Use api() for every request; it adds what the
// server insists on (the session's CSRF token, a key that makes a repeated
// send harmless) and turns failures into one kind of error.

let csrf = null;
let current = null;
let roleNames = [];

export class ApiError extends Error {
  constructor(status, body) {
    const e = (body && body.error) || {};
    super(e.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = e.code || 'error';
    this.fields = e.fields || null;       // { fieldName: 'what is wrong' } for form errors
    this.current = e.current || null;     // the record as it is now, when someone else changed it
    this.rule = e.rule || null;           // which rule refused, when the route named one: conflict('...', { rule: 'max_open' })
    this.offline = status === 0;
  }
}

// Who is signed in? null when nobody is.
export async function loadSession() {
  try {
    const data = await api('GET', '/api/auth/me');
    csrf = data.csrf;
    current = data.user;
    roleNames = data.roles || [];
    return current;
  } catch (err) {
    if (err.status === 401) { current = null; return null; }
    throw err;
  }
}

// The app's roles as config.js lists them, most powerful first.
export const allRoles = () => roleNames;

// May someone with this role use a page or see a menu entry?
//   null             anyone signed in
//   'top'            the first role in config.js, whatever the app calls it
//   ['staff', ...]   these roles
export function allows(roles, role) {
  if (!roles) return true;
  if (roles === 'top') return roleNames.length > 0 && role === roleNames[0];
  return roles.includes(role);
}

// The Back button after signing out. A browser keeps the page it just left
// exactly as it was (names, records and all) and shows it again on Back
// without running any script or asking the server. On a shared computer that
// hands the last person's screen to the next one. So a page for signed-in
// people that comes back this way is hidden at once and loaded afresh, which
// sends a signed-out visitor to the sign-in page.
let guarded = false;
function reloadWhenRestored() {
  if (guarded) return;
  guarded = true;
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    document.documentElement.hidden = true;
    location.reload();
  });
}

// For pages that need a signed-in user: sends everyone else to the sign-in page.
export async function requireSession(roles = null) {
  reloadWhenRestored();
  const user = await loadSession();
  if (!user) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return new Promise(() => {}); }
  if (!allows(roles, user.role)) { location.href = '/'; return new Promise(() => {}); }
  return user;
}

export const currentUser = () => current;
export const setCsrf = (token) => { csrf = token; };

export async function api(method, url, body = undefined, { idempotencyKey = null, signal = undefined } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (csrf) headers['X-CSRF-Token'] = csrf;
    // One key per action, reused if this same action is sent again.
    headers['Idempotency-Key'] = idempotencyKey || crypto.randomUUID();
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal });
  } catch {
    throw new ApiError(0, { error: { code: 'offline', message: 'No connection. Check your internet and try again.' } });
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* an empty or non-JSON answer */ }
  if (!res.ok) throw new ApiError(res.status, data);
  if (data && data.csrf) csrf = data.csrf;
  return data;
}

// Show the server's "this field is wrong" answers next to the fields.
// Expects each field to be followed by <p class="field-error" data-for="name"></p>.
export function showFieldErrors(form, err) {
  for (const el of form.querySelectorAll('.field-error')) { el.textContent = ''; }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const summary = form.querySelector('.form-error');
  if (summary) summary.textContent = err.fields ? '' : err.message;
  if (!err.fields) return;
  let first = null;
  for (const [name, message] of Object.entries(err.fields)) {
    const slot = form.querySelector(`.field-error[data-for="${CSS.escape(name)}"]`);
    const input = form.elements[name];
    if (slot) slot.textContent = message; else if (summary) summary.textContent += `${message} `;
    if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
  }
  if (first) first.focus();
}

// Stop a second click while the first is on its way, and say so.
export async function withBusy(button, work) {
  if (button.disabled) return undefined;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = button.dataset.busy || 'Working…';
  try { return await work(); } finally { button.disabled = false; button.textContent = label; }
}

// Put text on the page safely. Never build HTML by joining strings that
// contain what a person typed; that is how one user's text runs as code in
// another user's browser.
// Children that are null, undefined or false are left out, so a part can be
// conditional: el('p', {}, name, isYou ? ' (you)' : null). To replace what is
// inside an existing node the same way, use fill() below.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'style') {
      // The app's security policy ignores style="..." written into the page,
      // silently. Styles belong in app.css as a class. For a value that is
      // only known at run time (a width in percent), pass an object.
      if (typeof value !== 'object') throw new Error('el(): give style as an object, { width: "40%" }, or use a class from app.css. A style written as text is blocked by the security policy.');
      for (const [name, v] of Object.entries(value)) {
        if (name.startsWith('--')) node.style.setProperty(name, v); else node.style[name] = v;
      }
    }
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Replace what is inside a node. Like node.replaceChildren(...), except that
// it leaves out null, undefined and false the way el() does, and takes lists.
// The browser's own replaceChildren() prints the word "null" on the page for
//   pager.replaceChildren(text, more ? button : null)
// so use fill(pager, text, more ? button : null).
export function fill(node, ...children) {
  node.replaceChildren(...children.flat(Infinity)
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child) => (child instanceof Node ? child : document.createTextNode(String(child)))));
  return node;
}

// Tell the person what just happened: announce('Booked.') or
// announce('That did not work.', 'error'). The message appears at the bottom
// of the window wherever they have scrolled to, and screen readers read it
// out. Good news fades after a few seconds; a problem stays until the next
// message. Every signed-in page needs <p id="status" role="status" aria-live="polite"></p>.
let statusTimer = null;
export function announce(message, kind = 'ok') {
  const region = document.getElementById('status');
  if (!region) return;
  clearTimeout(statusTimer);
  region.textContent = message || '';
  region.dataset.kind = kind;
  if (message && kind !== 'error') statusTimer = setTimeout(() => { region.textContent = ''; }, 8000);
}
