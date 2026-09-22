/**
 * HTML by construction, escaped by default.
 *
 * Game labels, alert messages and bet-mode names all come from an upstream API
 * and are untrusted. The tagged template escapes every interpolation, and the
 * ONLY way to emit markup is an explicit `raw()` - so an injection has to be
 * written deliberately rather than forgotten accidentally.
 *
 * `html` returns a Raw, so a fragment nested inside another fragment passes
 * through unescaped while the untrusted string inside it does not.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Raw {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

export function raw(value) {
  return new Raw(value);
}

export function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

/**
 * null, undefined and false render as nothing rather than as their own names.
 * `${state.stale && banner()}` is the natural way to write a conditional
 * fragment, and printing "false" into the page would be a silly way to lose.
 */
function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(value);
}
