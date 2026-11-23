// Reading a spreadsheet export (CSV) and turning it into clean rows:
// the same row twice, empty cells, and files with a hundred thousand lines
// are the normal case, not the exception.

// Reads CSV text row by row without building the whole file as one array.
// Handles quoted cells, commas and line breaks inside quotes, doubled quotes,
// Windows and Unix line ends, and the invisible mark Excel puts at the start.
export function* parseCsv(text, { delimiter = ',' } = {}) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let row = [];
  let cell = '';
  let quoted = false;
  let sawAny = false;
  for (; i < n; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') { quoted = true; sawAny = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; sawAny = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (sawAny || cell !== '') { row.push(cell); yield row; }
      row = []; cell = ''; sawAny = false;
      continue;
    }
    cell += ch;
    sawAny = true;
  }
  if (sawAny || cell !== '') { row.push(cell); yield row; }
}

// Import with a report a person can act on.
//
//   const report = importCsv(text, {
//     required: ['email', 'amount'],                 // column names from the first line
//     keyOf: (r) => r.email.toLowerCase(),           // what makes two rows "the same"
//     clean: (r) => ({ email: r.email.trim().toLowerCase(), amount: Number(r.amount) }),  // throw to reject a row
//     missing: { city: 'unknown' },                  // optional columns: value to use when the cell is empty
//     save: (batch) => tx(db, () => { for (const r of batch) insert.run(r.email, r.amount); }),
//   });
//   report -> { total, imported, duplicates, incomplete, invalid, filled, problems: [{ line, reason }] }
//
// Rows are saved in batches, so a large file does not hold the database for
// its whole length and memory use stays flat. Decide per app what a duplicate
// of something already in the database means (skip, or update): do that in
// save() with INSERT ... ON CONFLICT.
export function importCsv(text, { required = [], keyOf = null, clean = (r) => r, missing = {}, save, batchSize = 500, maxProblems = 50, delimiter = ',' }) {
  const report = { total: 0, imported: 0, duplicates: 0, incomplete: 0, invalid: 0, filled: 0, problems: [] };
  const note = (line, reason) => { if (report.problems.length < maxProblems) report.problems.push({ line, reason }); };
  const seen = new Set();
  let header = null;
  let batch = [];
  let line = 0;

  for (const cells of parseCsv(text, { delimiter })) {
    line++;
    if (!header) {
      header = cells.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const absent = required.filter((c) => !header.includes(c));
      if (absent.length) throw new Error(`The file has no column named: ${absent.join(', ')}. Its columns are: ${header.join(', ')}.`);
      continue;
    }
    if (cells.every((c) => c.trim() === '')) continue;          // a blank line is not a row
    report.total++;
    const raw = {};
    header.forEach((name, idx) => { raw[name] = (cells[idx] ?? '').trim(); });

    const empty = required.filter((c) => raw[c] === '');
    if (empty.length) { report.incomplete++; note(line, `empty: ${empty.join(', ')}`); continue; }
    for (const [col, value] of Object.entries(missing)) {
      if (raw[col] === undefined || raw[col] === '') { raw[col] = value; report.filled++; }
    }
    let row;
    try { row = clean(raw); }
    catch (err) { report.invalid++; note(line, err.message); continue; }
    if (keyOf) {
      const key = keyOf(row);
      if (seen.has(key)) { report.duplicates++; note(line, `same as an earlier row (${key})`); continue; }
      seen.add(key);
    }
    batch.push(row);
    if (batch.length >= batchSize) { save(batch); report.imported += batch.length; batch = []; }
  }
  if (!header) throw new Error('The file is empty.');
  if (batch.length) { save(batch); report.imported += batch.length; }
  return report;
}

// Small helpers for summaries where some values are missing.
export const stats = {
  // null, undefined, '' and NaN are "missing", and are counted, not treated as zero.
  summarize(values) {
    const nums = values.filter((v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))).map(Number);
    const count = nums.length;
    if (!count) return { count: 0, missing: values.length, sum: 0, mean: null, min: null, max: null, median: null };
    const sorted = [...nums].sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const mid = Math.floor(count / 2);
    return {
      count, missing: values.length - count, sum, mean: sum / count, min: sorted[0], max: sorted[count - 1],
      median: count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    };
  },
};
