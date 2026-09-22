/**
 * The Donations page: the project's donation addresses, each with a copy
 * button and a QR code to scan with a phone wallet. Static - it reads no
 * polled data - but it sits in the same shell as every other page so it is
 * one click away from anywhere in the dashboard.
 *
 * The QR encodes the bare address, not a payment URI: a URI names a chain
 * and token, and the USDT address is an EVM address on a network the page
 * does not state - a wallet reading a bare address asks instead of guessing.
 * The page opts out of the dashboard's 30-second refresh (`data-static`) so
 * an open QR does not snap shut mid-scan.
 */

import { html } from '../html.mjs';
import { shell } from './shell.mjs';
import { DONATIONS } from '../../donations.mjs';
import { qrSvg } from '../qr.mjs';

export function renderDonate({ state }) {
  const body = html`<div data-static hidden></div><div class="page-heading"><div><div class="eyebrow">SUPPORT THE PROJECT</div><h1>Donations<span>.</span></h1>
      <p>This dashboard is free and open source. If it is useful to your studio, a donation funds its continued development, improvements and new iterations.</p></div></div>
  <section class="panel donate-list">
    ${DONATIONS.map((d) => html`<div class="donate-row"><div class="donate-asset">${d.asset}</div>
      <code class="donate-address">${d.address}</code>
      <div class="donate-actions"><button type="button" class="donate-copy" data-copy="${d.address}">Copy</button>
        <details class="donate-qr"><summary>QR</summary><div class="donate-qr-pop">${qrSvg(d.address, { label: `${d.asset} donation address` })}
          <small>${d.asset}</small></div></details></div></div>`)}
  </section>
  <p class="dim donate-note">Check that the address you paste matches the one shown here before you send anything. Thank you.</p>`;
  return shell({ state, body, active: 'donate', title: 'Donations' });
}
