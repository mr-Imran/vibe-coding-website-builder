// Check what a person typed before it gets anywhere near the database.
// The browser may check too, for comfort. This check is the one that counts:
// a request can be sent without the page.

import { invalid } from './errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

// schema: { field: { type, required, min, max, minLength, maxLength, values, pattern, default, label } }
// types: string, text (keeps line breaks), int, number, bool, email, date, datetime, enum
// Returns a new object with only the fields named in the schema. Unknown
// fields are an error, so nobody can slip in "role": "admin".
// partial: true is for edits, where only the fields that were sent are checked.
export function check(input, schema, { partial = false } = {}) {
  const fields = {};
  const out = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid({ _: 'Send the details as an object.' });
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(schema, key)) fields[key] = 'This field is not expected.';
  }
  for (const [key, rule] of Object.entries(schema)) {
    let value = input[key];
    const label = rule.label || key;
    if (typeof value === 'string' && rule.type !== 'text') value = value.trim();
    const missing = value === undefined || value === null || value === '';
    if (missing) {
      if (partial && value === undefined) continue;
      if (rule.default !== undefined) { out[key] = rule.default; continue; }
      if (rule.required) fields[key] = `${label} is needed.`;
      else if (value !== undefined) out[key] = null;
      continue;
    }
    const problem = checkOne(value, rule, label);
    if (problem.error) fields[key] = problem.error;
    else out[key] = problem.value;
  }
  if (Object.keys(fields).length) throw invalid(fields);
  return out;
}

function checkOne(value, rule, label) {
  switch (rule.type) {
    case 'string':
    case 'text':
    case 'email': {
      if (typeof value !== 'string') return { error: `${label} must be text.` };
      const max = rule.maxLength ?? (rule.type === 'text' ? 5000 : 200);
      if (value.length > max) return { error: `${label} is too long (at most ${max} characters).` };
      if (rule.minLength && value.length < rule.minLength) return { error: `${label} is too short (at least ${rule.minLength} characters).` };
      if (rule.type === 'email') {
        if (!EMAIL.test(value) || value.length > 254) return { error: 'This does not look like an email address.' };
        return { value: value.toLowerCase() };
      }
      if (rule.pattern && !rule.pattern.test(value)) return { error: rule.message || `${label} is not in the expected form.` };
      return { value };
    }
    case 'int':
    case 'number': {
      const n = typeof value === 'number' ? value : (typeof value === 'string' && value !== '' ? Number(value) : NaN);
      if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
      if (rule.type === 'int' && !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
      if (rule.min !== undefined && n < rule.min) return { error: `${label} must be at least ${rule.min}.` };
      if (rule.max !== undefined && n > rule.max) return { error: `${label} must be at most ${rule.max}.` };
      return { value: n };
    }
    case 'bool': {
      if (value === true || value === 'true' || value === 1 || value === '1') return { value: 1 };
      if (value === false || value === 'false' || value === 0 || value === '0') return { value: 0 };
      return { error: `${label} must be yes or no.` };
    }
    case 'date':
    case 'datetime': {
      const ok = typeof value === 'string' && (rule.type === 'date' ? DATE : DATETIME).test(value)
        && !Number.isNaN(Date.parse(value)) && realDay(value.slice(0, 10));
      if (!ok) return { error: `${label} is not a valid ${rule.type === 'date' ? 'date' : 'date and time'}.` };
      if (rule.min && value < rule.min) return { error: `${label} is too early.` };
      if (rule.max && value > rule.max) return { error: `${label} is too late.` };
      return { value };
    }
    case 'enum': {
      if (!rule.values.includes(value)) return { error: `${label} must be one of: ${rule.values.join(', ')}.` };
      return { value };
    }
    default:
      throw new Error(`validate: unknown type "${rule.type}" for ${label}`);
  }
}

// 30 February parses without complaint and quietly becomes 2 March. Reject it.
function realDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// For ids in the address: /api/things/:id
export function idParam(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw invalid({ [label]: 'Not a valid id.' }, 'Not found.');
  return n;
}
