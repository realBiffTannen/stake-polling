/**
 * Settings: sign-in first, then what the dashboard is running on.
 *
 * Every change is an ordinary form POST (see /settings/auth in server.mjs)
 * that redirects back here with a result code, so a reload never repeats it
 * and the whole page works without JavaScript. The two destructive actions
 * sit in <dialog>s: app.js opens them as modals; without JavaScript their
 * trigger links reload the page with the dialog already open.
 */

import { html, raw } from '../html.mjs';
import { shell } from './shell.mjs';
import { ICONS } from './icons.mjs';
import { PASSWORD_MIN } from '../auth.mjs';
import { DASH } from '../format.mjs';

const TABS = [['security', 'Security'], ['system', 'System'], ['about', 'About']];

export const SETTINGS_ERRORS = {
  username: 'Use 1 to 64 letters, digits, dots, hyphens, underscores or @.',
  'password-short': `Use at least ${PASSWORD_MIN} characters.`,
  'password-long': 'That password is too long.',
  'password-mismatch': 'The two passwords do not match.',
  current: 'That is not the current password.',
  rate: 'Too many wrong passwords from this address. Wait a few minutes, then try again.',
  'already-on': 'Sign-in is already on.',
  'not-on': 'Sign-in is off.',
  csrf: 'The form expired. Try again.',
};

export const SETTINGS_OK = {
  enabled: 'Sign-in is on, and this browser is signed in.',
  changed: 'Saved. Every other session was signed out.',
  'signed-out': 'Every session was signed out.',
  disabled: 'Sign-in is off. Anyone who can reach this dashboard can use it.',
};

const tabOf = (tab) => (TABS.some(([key]) => key === tab) ? tab : 'security');

function field({ label, name, type = 'text', autocomplete, value = '', help = null, reveal = false, required = true, min = null }) {
  const input = html`<input type="${type}" name="${name}" autocomplete="${autocomplete}"${required ? raw(' required') : null}${min ? raw(` minlength="${Number(min)}"`) : null} value="${value}" spellcheck="false" autocapitalize="none">`;
  return html`<label class="field"><span class="field-label">${label}</span>
    ${reveal ? html`<span class="password-wrap">${input}<button type="button" class="reveal" data-reveal aria-label="Show password" aria-pressed="false" title="Show password">${ICONS.eye}</button></span>` : input}
    ${help ? html`<span class="field-help">${help}</span>` : null}</label>`;
}

const errorLine = (flash, name) => (flash.form === name && flash.error ? html`<p class="field-error" role="alert">${SETTINGS_ERRORS[flash.error] ?? 'That did not work. Try again.'}</p>` : null);
const hidden = (csrf, action) => html`<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="${action}">`;

function confirmDialog({ id, open, title, body, action, csrf, flash, submit }) {
  return html`<dialog id="${id}" class="dialog" aria-labelledby="${id}-title"${open ? raw(' open') : null}>
    <form method="post" action="/settings/auth">${hidden(csrf, action)}
      <h3 id="${id}-title">${title}</h3><p class="dim">${body}</p>
      ${field({ label: 'Current password', name: 'current', type: 'password', autocomplete: 'current-password', reveal: true })}
      ${errorLine(flash, action)}
      <div class="dialog-actions"><a class="button secondary" href="/settings?tab=security" data-dialog-close>Cancel</a>
        <button class="button danger" type="submit">${submit}</button></div>
    </form></dialog>`;
}

function security({ auth, csrf, flash, confirm }) {
  const on = auth.enabled;
  const http = html`<div class="callout"><b>Over plain HTTP the password crosses the network unencrypted.</b> On a network you do not trust, bind the dashboard to this machine (<code>npm start -- --host 127.0.0.1</code>) and reach it over an SSH tunnel, or put it behind a reverse proxy that serves HTTPS.</div>`;
  const head = html`<div class="setting-row"><div><h2>Require sign-in</h2>
      <p class="dim">${on ? html`On - signed in as <b>${auth.username}</b>. Every page, export and archive download needs a session.` : 'Off - anyone who can reach this dashboard can use it.'}</p></div>
    ${on ? html`<a class="switch on" role="switch" aria-checked="true" href="/settings?tab=security&amp;confirm=disable" data-dialog="dlg-disable" aria-label="Require sign-in (on) - turn off"><span></span></a>`
      : html`<a class="switch" role="switch" aria-checked="false" href="#enable" aria-label="Require sign-in (off) - turn on"><span></span></a>`}</div>`;
  if (!on) {
    return html`<section class="panel">${head}
      <form id="enable" class="form-grid" method="post" action="/settings/auth">${hidden(csrf, 'enable')}
        <h3>Turn on sign-in</h3>
        ${field({ label: 'Username', name: 'username', autocomplete: 'username', help: 'Letters, digits, dots, hyphens, underscores or @.' })}
        ${field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'new-password', reveal: true, min: PASSWORD_MIN, help: `At least ${PASSWORD_MIN} characters. A passphrase of a few words is easy to type and hard to guess.` })}
        ${field({ label: 'Confirm password', name: 'confirm', type: 'password', autocomplete: 'new-password', reveal: true })}
        ${errorLine(flash, 'enable')}
        <div><button class="button" type="submit">${ICONS.lock} Turn on sign-in</button></div>
      </form>${http}</section>`;
  }
  return html`<section class="panel">${head}
    <form class="form-grid" method="post" action="/settings/auth">${hidden(csrf, 'change')}
      <h3>Change username or password</h3>
      ${field({ label: 'Username', name: 'username', autocomplete: 'username', value: auth.username })}
      ${field({ label: 'New password', name: 'password', type: 'password', autocomplete: 'new-password', reveal: true, required: false, help: `Leave empty to keep the current one. At least ${PASSWORD_MIN} characters.` })}
      ${field({ label: 'Confirm new password', name: 'confirm', type: 'password', autocomplete: 'new-password', reveal: true, required: false })}
      ${field({ label: 'Current password', name: 'current', type: 'password', autocomplete: 'current-password', reveal: true, help: 'Saving signs every other session out.' })}
      ${errorLine(flash, 'change')}
      <div><button class="button" type="submit">Save</button></div>
    </form>
    <div class="setting-row danger-zone"><div><h3>Sessions</h3><p class="dim">Sign every browser out, this one included.</p></div>
      <a class="button secondary" href="/settings?tab=security&amp;confirm=signout" data-dialog="dlg-signout">${ICONS.logout} Sign out everywhere</a></div>
    ${http}
    ${confirmDialog({ id: 'dlg-signout', open: confirm === 'signout' || flash.form === 'signout-all', title: 'Sign out everywhere?', body: 'Every browser signed in to this dashboard is signed out, this one included.', action: 'signout-all', csrf, flash, submit: 'Sign out everywhere' })}
    ${confirmDialog({ id: 'dlg-disable', open: confirm === 'disable' || flash.form === 'disable', title: 'Turn off sign-in?', body: 'The username and password are deleted and every session ends. Anyone who can reach this dashboard can then use it.', action: 'disable', csrf, flash, submit: 'Turn off sign-in' })}
  </section>`;
}

function system({ state, archive, csrf }) {
  const hiddenCount = state.dismissed?.size ?? 0;
  const m = state.redisMemory;
  const pct = m ? Math.min(100, (m.usedBytes / m.limitBytes) * 100) : null;
  return html`<section class="panel"><h2>Redis</h2>
    <div class="setting-row"><div><h3>Memory</h3><p class="dim">${m ? html`${m.human} of the ${m.limitHuman} limit (REDIS_DB_SIZE)` : 'Not readable - INFO memory was refused or failed.'}</p></div>
      ${m ? html`<meter class="level" min="0" max="${m.limitBytes}" low="${Math.round(m.limitBytes * 0.7)}" high="${Math.round(m.limitBytes * 0.9)}" optimum="0" value="${m.usedBytes}" title="${pct.toFixed(1)}% of the limit">${pct.toFixed(1)}%</meter>` : html`<span class="tag">${DASH}</span>`}</div>
    <div class="setting-row"><div><h3>Persistence</h3><p class="dim">${state.meta?.persistence === 'aof' ? 'AOF on - the trail survives a Redis restart.' : state.meta?.persistence === 'off' ? 'AOF off - the trail lives only until the next Redis restart. Run npm run enable-persistence.' : 'Unknown.'}</p></div>
      <span class="tag ${state.meta?.persistence === 'aof' ? 'live-tag' : ''}">${state.meta?.persistence ?? DASH}</span></div>
    <h2 class="gap">Collector and archive</h2>
    <div class="setting-row"><div><h3>Poll interval</h3><p class="dim">Every endpoint is read on the clock at this interval.</p></div><span class="tag">${Number(state.pollMinutes) > 0 ? `${state.pollMinutes} min` : DASH}</span></div>
    <div class="setting-row"><div><h3>Nightly archive</h3><p class="dim">${archive?.where ? `${archive.kind === 's3' ? 'S3' : 'Local directory'}: ${archive.where}` : 'Not set up.'}</p></div><a class="button secondary" href="/archive">Open archive</a></div>
    <h2 class="gap">Dashboard</h2>
    <div class="setting-row"><div><h3>Dismissed warnings</h3><p class="dim">${hiddenCount ? `${hiddenCount} standing ${hiddenCount === 1 ? 'warning is' : 'warnings are'} hidden for everyone. A warning whose content changes shows again by itself.` : 'None - every standing warning is shown.'}</p></div>
      ${hiddenCount ? html`<form method="post" action="/dismiss"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="restore" value="all"><input type="hidden" name="back" value="/settings?tab=system"><button class="button secondary" type="submit">Show them again</button></form>` : null}</div>
  </section>`;
}

function about({ version }) {
  return html`<section class="panel"><h2>stake-polling <span class="tag">v${version}</span></h2>
    <p class="dim">Minute-resolution Engine accounting, polled into Redis, with this dashboard, a terminal dashboard and anomaly detection. Open source under the MIT licence.</p>
    <p><a class="game-link" href="https://github.com/realBiffTannen/stake-polling" rel="noreferrer">Source on GitHub</a></p></section>`;
}

/**
 * @param {{ state: object, tab?: string, auth: { enabled: boolean, username: string|null }, csrf: string,
 *   flash?: { ok?: string, error?: string, form?: string }, confirm?: string|null, archive?: object, version: string }} args
 */
export function renderSettings({ state, tab, auth, csrf, flash = {}, confirm = null, archive = null, version }) {
  const current = tabOf(tab);
  const ok = flash.ok && SETTINGS_OK[flash.ok];
  const body = html`<div data-static hidden></div><div class="page-heading"><div><div class="eyebrow">CONFIGURATION</div><h1>Settings<span>.</span></h1>
      <p>Sign-in for this dashboard, and what it is running on.</p></div></div>
  <nav class="tabs" aria-label="Settings sections">${TABS.map(([key, label]) => html`<a href="/settings?tab=${key}" class="${key === current ? 'selected' : ''}"${key === current ? raw(' aria-current="page"') : null}>${label}</a>`)}</nav>
  ${ok ? html`<div class="toast" role="status" data-toast>${ok}</div>` : null}
  ${current === 'security' ? security({ auth, csrf, flash, confirm }) : current === 'system' ? system({ state, archive, csrf }) : about({ version })}`;
  return shell({ state, body, active: 'settings', title: 'Settings' });
}

