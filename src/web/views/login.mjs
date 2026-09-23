/**
 * The sign-in page: shown in place of every page while sign-in is on and the
 * browser has no session. Standalone - no sidebar, nothing about the studio
 * beyond its name - because everything else is what it protects.
 */

import { html } from '../html.mjs';
import { assetUrl } from '../static.mjs';
import { ICONS } from './icons.mjs';

const ERRORS = {
  invalid: 'That username and password do not match.',
  rate: 'Too many wrong attempts from this address. Wait a few minutes, then try again.',
  csrf: 'The form expired. Try again.',
};

export function renderLogin({ error = null, next = '/', csrf, username = '' }) {
  const message = error ? ERRORS[error] ?? ERRORS.invalid : null;
  return html`<div data-static hidden></div><div class="auth-page">
    <form class="auth-card" method="post" action="/login" novalidate>
      <img class="cg-logo" src="${assetUrl('/brand/logo.svg')}" alt="Crash Galaxy" width="150" height="32">
      <div><h1>Sign in<span>.</span></h1><p class="dim">This dashboard is private. Sign in to continue.</p></div>
      <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="next" value="${next}">
      <label class="field"><span class="field-label">Username</span>
        <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${username}"${message ? '' : ' autofocus'}></label>
      <label class="field"><span class="field-label">Password</span>
        <span class="password-wrap"><input type="password" name="password" autocomplete="current-password" required${message ? ' autofocus' : ''}>
          <button type="button" class="reveal" data-reveal aria-label="Show password" aria-pressed="false" title="Show password">${ICONS.eye}</button></span></label>
      <label class="check"><input type="checkbox" name="keep" value="1"> Keep me signed in for 30 days</label>
      ${message ? html`<p class="field-error" role="alert">${message}</p>` : null}
      <button class="button block" type="submit">Sign in</button>
      <p class="auth-note">Forgot the password? On the machine running the dashboard: <code>npm run auth -- disable</code></p>
    </form></div>`;
}
