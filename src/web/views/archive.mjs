/**
 * The nightly archive - every day the archiver has stored, and where to
 * download each one.
 *
 * For an S3 store every link is a presigned URL, signed when this page is
 * rendered and good for S3_PRESIGN_SECONDS - so the page is never cached, and
 * a reload always hands out fresh links. For the local store each file links
 * to itself on disk (a file:// URL, with its full path), and the dashboard
 * also serves it: browsers refuse to follow a file:// link out of an http://
 * page, and a file:// URL opened on another machine names that machine's disk.
 */

import { html } from '../html.mjs';
import { int, utcHm, DASH } from '../format.mjs';
import { humanBytes } from '../../store/memory.mjs';
import { shell } from './shell.mjs';

function utcStamp(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return DASH;
  const iso = new Date(n).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
}

function statusPanel(status) {
  if (!status) {
    return html`<section class="panel"><div class="section-heading"><div><h2>Last run</h2>
      <p>The archiver has not recorded a run yet. It runs on start and at every 00:00:00Z; <b>npm run archive -- --once</b> runs it now.</p></div></div></section>`;
  }
  const failed = status.failed ?? [];
  return html`<section class="panel"><div class="section-heading"><div><h2>Last run</h2>
      <p>${utcStamp(status.ranAt)} to ${status.destination ?? DASH}.
        ${status.stored?.length ? `Stored ${status.stored.map((s) => s.date).join(', ')}.` : 'Nothing new to store.'}</p></div></div>
    ${status.error ? html`<div class="notice warning">The run failed: ${status.error}</div>` : null}
    ${failed.length ? html`<ul class="list">${failed.map((f) => html`<li class="warn"><div><b>${f.date}</b> failed: ${f.error}</div></li>`)}</ul>` : null}
  </section>`;
}

/**
 * @param {{ state: object, listing: { kind: 'local'|'s3', where: string, files: object[], presignSeconds?: number, status?: object|null, error?: string|null } | null }} args
 */
export function renderArchive({ state, listing }) {
  const now = Number(state?.now) || Date.now();
  const s3 = listing?.kind === 's3';
  const files = listing?.files ?? [];
  const expires = s3 && listing.presignSeconds ? now + listing.presignSeconds * 1000 : null;

  const body = html`<div class="page-heading"><div><div class="eyebrow">KEPT PAST REDIS</div><h1>Archive<span>.</span></h1>
      <p>At every 00:00:00Z the UTC day that just ended - every stream the collector wrote - is gzipped and stored, beyond the 30 days Redis keeps.</p></div></div>
  <div class="scope-line"><span>${listing ? (s3 ? `S3: ${listing.where}` : `Local directory: ${listing.where}`) : 'The archive store is not set up.'}</span>
    ${expires ? html`<span>Links are presigned until ${utcHm(expires)} - reload for fresh ones.</span>` : null}</div>
  ${listing?.error ? html`<div class="notice warning">Could not list the archive: ${listing.error}</div>` : null}
  ${listing && !s3 && files.length ? html`<p class="dim">Each file links to itself on this machine's disk. Most browsers will not open a file:// link from a web page - copy the path (or right-click the link and copy it) into Finder, a terminal or the address bar, or use Download, which works from any machine.</p>` : null}

  ${statusPanel(listing?.status ?? null)}

  <section class="panel"><div class="section-heading"><div><h2>Stored days</h2>
      <p>Each file is the poll log's all-streams CSV for one UTC day (the same as Download CSV on the poll log), gzipped. Money fields are raw micro-dollars; a trail's profit is the GROSS house win.</p></div>
      <span class="tag">${int(files.length)} ${files.length === 1 ? 'file' : 'files'}</span></div>
    <div class="scroll"><table class="archive"><thead><tr><th>UTC day</th><th>File</th><th>Size</th><th>Stored</th><th>Download</th></tr></thead>
      <tbody>${files.length ? files.map((f) => html`<tr>
        <td>${f.date}</td><td class="label-cell">${f.fileUrl ? html`<a class="game-link" href="${f.fileUrl}">${f.name}</a><code class="local-path">${f.path}</code>` : f.name}</td><td>${humanBytes(f.bytes) ?? DASH}</td><td>${utcStamp(f.modified)}</td>
        <td>${f.url ? html`<a class="game-link" href="${f.url}" rel="noreferrer" download="${f.name}">Download ↓</a>
          ${s3 ? html`<details class="presigned"><summary>Presigned URL</summary><code>${f.url}</code></details>` : null}` : DASH}</td></tr>`)
        : html`<tr><td colspan="5" class="empty"><div class="empty-state"><b>No days archived yet</b>
          <span>The archiver stores each finished UTC day at 00:00:00Z. To store the last week now: <code>npm run archive -- --once</code></span></div></td></tr>`}</tbody></table></div></section>`;

  return shell({ state, body, active: 'archive', title: 'Archive' });
}
