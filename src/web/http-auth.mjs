/**
 * The HTTP side of sign-in: cookies, forms, CSRF and where to send someone
 * after they sign in. Pure helpers; src/web/server.mjs wires them in.
 *
 * Two cookies, both HttpOnly and SameSite=Strict:
 *   sp_session  the session token (src/web/auth.mjs), only while signed in
 *   sp_csrf     a random value every form repeats in a hidden field. A POST
 *               is accepted only when the two match and, if the browser sent
 *               an Origin, it is this server. Checked even while sign-in is
 *               off: otherwise another site could turn sign-in on with its
 *               own password and lock the owner out.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sp_session';
export const CSRF_COOKIE = 'sp_csrf';
const FORM_LIMIT = 16 * 1024;

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!name || Object.hasOwn(out, name)) continue;
    try { out[name] = decodeURIComponent(part.slice(at + 1).trim()); } catch { /* a malformed value is no value */ }
  }
  return out;
}

/** A Set-Cookie value. `maxAge` null makes it a browser-session cookie; 0 deletes it. */
export function cookie(name, value, { maxAge = null, secure = false } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    ...(maxAge === null ? [] : [`Max-Age=${Math.max(0, Math.floor(maxAge))}`]), ...(secure ? ['Secure'] : [])].join('; ');
}

/** Secure cookies only when the request really arrived over TLS (directly, or via a proxy that says so). */
export const isSecure = (req) => Boolean(req.socket?.encrypted) || req.headers['x-forwarded-proto'] === 'https';

export const newCsrf = () => randomBytes(24).toString('base64url');

/** The form token matches the cookie, and any Origin the browser sent is this host. */
export function csrfOk(req, cookies, form) {
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let host;
    try { host = new URL(origin).host; } catch { return false; }
    if (host !== req.headers.host) return false;
  } else if (origin === 'null') {
    return false;
  }
  const a = Buffer.from(String(cookies[CSRF_COOKIE] ?? ''));
  const b = Buffer.from(String(form.get('csrf') ?? ''));
  return a.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

/** An urlencoded form body, or null if it is not one or is too large. */
export async function readForm(req) {
  if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers['content-type'] ?? '')) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > FORM_LIMIT) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Where to go after signing in: a path on this server, or "/". Never another
 * host - `//evil.example`, `/\evil.example` and absolute URLs all fall back.
 */
export function safeNext(next) {
  const s = String(next ?? '');
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '/';
  let url;
  try { url = new URL(s, 'http://this.invalid'); } catch { return '/'; }
  if (url.origin !== 'http://this.invalid') return '/';
  if (url.pathname === '/login') return '/';
  url.searchParams.delete('fragment');
  return `${url.pathname}${url.search}`;
}
