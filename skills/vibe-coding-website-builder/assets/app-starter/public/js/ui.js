// Two things nearly every screen needs, written once: a list with search,
// filters, an order and pages, and a yes-or-no question asked in the page.
// The People screen uses both; copy from there.

import { api, el, fill } from './api.js';

// A list that always shows one of four things: loading, nothing here (and
// what to do next), the rows, or what went wrong with a way to try again.
// It reads what the route returns from listQuery(): { rows, total, page, pages }.
// A short list with no search or pages (four machines) can come from a route
// that answers with a plain array; it still gets the four states.
//
//   const list = createList({
//     url: '/api/classes',
//     body: document.getElementById('rows'),          // the table's <tbody>, or a <ul>
//     row: (record, data) => el('tr', {}, ...),       // one row, built with el(); data is the whole answer
//     empty: (narrowed) => narrowed                   // text or elements; told whether the person
//       ? 'Nothing matches. Try fewer words.'         // has changed the search or filters
//       : 'No classes yet. Add the first one below.',
//     filters: document.getElementById('filters'),    // a <form>; every named field becomes ?name=value
//     pager: document.getElementById('pager'),        // an empty element for "Page 2 of 5" and the buttons
//     loaded: (data) => { ... },                      // optional: show data.total or data.sums above the list
//   });
//   await list.load();        // again after anything changes: list.load()
//
// loaded(data) runs before the rows are built, so anything it keeps from
// the answer (the server's "now", what this person may still book) is
// already there for row(). A row can also read it from its second argument.
//
// The form's fields are the route's own words: a search box named q, a
// <select name="sort"> whose values are the route's sortable names ("-day"
// for newest first), and one field per filter. Changing any of them loads
// page 1 again; typing in a search box waits a moment first. The same names
// in the page's own address (/classes?status=open) set the fields before the
// first load, so another page can link to the list already narrowed.
export function createList({ url, body, row, empty, filters = null, pager = null, loaded = null }) {
  let page = 1;
  let latest = 0;
  let timer = null;

  function params() {
    const p = new URLSearchParams();
    for (const field of filters ? filters.elements : []) {
      if (!field.name || field.closest('[hidden]')) continue;
      const value = field.type === 'checkbox' ? (field.checked ? field.value : '') : field.value.trim();
      if (value) p.set(field.name, value);
    }
    return p;
  }
  // The choices the page starts with. Anything else means the person narrowed the list.
  const untouched = params().toString();
  // A link can open the list already narrowed: /members?approved=0 sets the
  // form's "approved" field before the first load, so a figure on the home
  // page ("1 waiting for approval") can lead straight to those rows.
  if (filters) {
    for (const [name, value] of new URLSearchParams(location.search)) {
      const field = filters.elements[name];
      if (!field || field.length !== undefined && field.tagName !== 'SELECT') continue;
      if (field.type === 'checkbox') field.checked = value === field.value;
      else field.value = value;
    }
  }

  // One line in place of the rows, whatever the list is made of.
  function message(...content) {
    if (body.tagName === 'TBODY') {
      const head = body.closest('table').querySelector('thead tr');
      fill(body, el('tr', {}, el('td', { class: 'empty', colspan: String(head ? head.children.length : 1) }, ...content)));
    } else {
      fill(body, el(body.tagName === 'UL' || body.tagName === 'OL' ? 'li' : 'p', { class: 'empty' }, ...content));
    }
  }

  async function load() {
    const mine = ++latest;
    const p = params();
    const narrowed = p.toString() !== untouched;
    p.set('page', String(page));
    if (!body.children.length) message('Loading…');
    body.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = await api('GET', `${url}${url.includes('?') ? '&' : '?'}${p}`);
    } catch (err) {
      if (mine !== latest) return;
      body.removeAttribute('aria-busy');
      const why = err.fields ? Object.values(err.fields).join(' ') : err.message;
      message(`${why} `, el('button', { type: 'button', class: 'link', onclick: load }, 'Try again'));
      if (pager) fill(pager);
      return;
    }
    if (mine !== latest) return;                       // a newer search was asked for meanwhile
    body.removeAttribute('aria-busy');
    if (Array.isArray(data)) data = { rows: data, total: data.length, page: 1, pages: 1 };
    if (data.pages >= 1 && page > data.pages) { page = data.pages; await load(); return; }
    if (loaded) loaded(data);
    if (data.rows.length) fill(body, data.rows.map((record) => row(record, data)));
    else message(empty(narrowed));
    if (pager) {
      const turn = (to, label) => el('button', { type: 'button', class: 'button quiet', onclick: () => { page = to; load(); } }, label);
      fill(pager,
        data.total ? el('p', {}, `Page ${data.page} of ${data.pages} (${data.total} in all)`) : null,
        data.page > 1 ? turn(data.page - 1, 'Previous page') : null,
        data.page < data.pages ? turn(data.page + 1, 'Next page') : null);
    }
  }

  if (filters) {
    const again = () => { page = 1; load(); };
    filters.addEventListener('submit', (event) => { event.preventDefault(); clearTimeout(timer); again(); });
    filters.addEventListener('change', () => { clearTimeout(timer); again(); });
    filters.addEventListener('input', (event) => {
      if (event.target.type !== 'search' && event.target.type !== 'text') return;
      clearTimeout(timer);
      timer = setTimeout(again, 300);
    });
  }
  return { load };
}

// Ask a yes-or-no question in the page, in place of the browser's own
// confirm() box. Nothing has to be added to the page's HTML.
//
//   if (await ask({ title: 'Cancel this booking?', text: 'The place goes back to the class.', yes: 'Cancel the booking', danger: true })) { ... }
//
// The answer is true only when the person chose yes. Escape, or the other
// button, is no. The safe answer has the focus when the question opens, and
// the focus goes back to where it was when it closes.
let asked = 0;
export function ask({ title, text = '', yes = 'Yes', no = 'No, go back', danger = false }) {
  const id = `ask-title-${++asked}`;
  const yesButton = el('button', { type: 'button', class: danger ? 'button danger' : 'button' }, yes);
  const noButton = el('button', { type: 'button', class: 'button quiet', autofocus: true }, no);
  const dialog = el('dialog', { 'aria-labelledby': id },
    el('h2', { id }, title),
    text ? el('p', {}, text) : null,
    el('p', { class: 'actions' }, yesButton, noButton));
  document.body.append(dialog);
  return new Promise((resolve) => {
    let answer = false;
    yesButton.addEventListener('click', () => { answer = true; dialog.close(); });
    noButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); });
    dialog.showModal();
  });
}
