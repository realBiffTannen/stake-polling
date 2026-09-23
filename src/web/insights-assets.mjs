export const INSIGHTS_CSS = `
:root{color-scheme:dark;--bg:#0c1019;--panel:#131a26;--line:#263044;--text:#edf1f7;--dim:#8d9bb0;--good:#7fdec1;--bad:#ff8796;--warn:#f8c877;--link:#89e0c7;--mint:#86e1c4;--violet:#a69aff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:inherit;text-decoration:none}a:hover{color:var(--mint)}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--mint);outline-offset:4px}main{display:block;padding:0}h1,h2,h3,p{margin:0}.muted,.dim{color:var(--dim)}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.sidebar{position:fixed;inset:0 auto 0 0;width:220px;padding:32px 22px;background:#101622;border-right:1px solid var(--line);display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:750;letter-spacing:1px;white-space:nowrap}.brand small{display:block;font-size:9px;font-weight:500;letter-spacing:1.8px;color:var(--dim);margin-top:3px}.nav-label{font-size:10px;letter-spacing:1.5px;color:#6e7f99;margin:50px 12px 16px}nav{display:flex;flex-direction:column;gap:8px}nav a{border-radius:7px;color:#9daabe;padding:11px 12px;font-weight:500;font-size:13px}nav a>span{display:inline-block;width:24px;font-size:18px;line-height:16px;vertical-align:middle}nav a.active{color:var(--mint);background:#1e3536}nav a:hover{background:#192432}.sidebar-foot{margin-top:auto;font-size:12px;color:#c4cfdf;padding:0 10px}.sidebar-foot small{display:block;color:#70819c;line-height:1.8;margin-top:12px}.status-dot{width:6px;height:6px;background:var(--mint);display:inline-block;border-radius:50%;margin-right:7px;box-shadow:0 0 0 4px #79dec116}.status-dot.stale{background:var(--warn)}
.workspace{margin-left:220px;min-width:0}.app-header{height:72px;padding:0 38px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim)}.app-header b{font-weight:500;color:var(--text)}.app-header>span .muted{margin:0 12px}.status{display:flex;align-items:center;font-size:11px;color:#bdc9d8}.status .muted{border-left:1px solid var(--line);padding-left:15px;margin-left:15px}.content{max-width:1700px;margin:auto;padding:36px 38px 25px;display:flex;flex-direction:column;gap:24px}.page-heading{display:flex;justify-content:space-between;align-items:center;gap:20px}.eyebrow{font-size:10px;letter-spacing:2.2px;font-weight:650;color:var(--mint);margin-bottom:7px}h1{font-size:36px;letter-spacing:-1.4px;line-height:1.2;font-weight:620}h1>span{color:var(--mint)}.page-heading p{font-size:13px;color:var(--dim);margin-top:10px}.button{border:0;background:var(--mint);color:#0c2923;padding:11px 17px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:650;white-space:nowrap;display:inline-block}.button:hover{background:#a0efd5;color:#0c2923}.button.secondary{background:transparent;color:#d0d9e5;border:1px solid #344055}.filters{display:flex;align-items:flex-end;gap:12px;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:9px;flex-wrap:wrap}.filters label{display:flex;flex-direction:column;gap:7px;color:#9aaac0;font-size:10px;letter-spacing:.7px;text-transform:uppercase}.filters label:first-child{flex:1;min-width:180px}.filters select,.filters input{height:39px;min-width:145px;border:1px solid #344055;border-radius:5px;background:#0e1520;color:#e4ebf4;padding:8px 10px;font-size:12px;letter-spacing:0;text-transform:none}.filters .button{height:39px}.quick-ranges{display:flex;border:1px solid #344055;border-radius:5px;padding:3px;gap:2px;height:39px}.quick-ranges a{padding:6px 10px;color:var(--dim);font-size:11px;font-weight:600;border-radius:3px}.quick-ranges a.selected{background:#263447;color:var(--text)}.scope-line{margin-top:-10px;display:flex;justify-content:space-between;gap:14px;color:var(--dim);font-size:11px}.scope-line b{color:#c5d3e6;font-weight:500}.scope-line .muted{margin:0 8px}
.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.metric-card{padding:22px 22px 18px;border:1px solid var(--line);border-radius:9px;background:var(--panel);position:relative}.metric-card.accent{background:linear-gradient(135deg,#193331,#16262c);border-color:#315650}.metric-label{font-size:12px;color:#b5c2d4;font-weight:500}.metric-value{font-size:32px;font-weight:600;letter-spacing:-1px;line-height:1.2;margin:14px 0}.metric-card.accent .metric-value{color:#a1edd5}.metric-note{font-size:10px;color:#91a3b9}.panel{padding:23px 25px;background:var(--panel);border:1px solid var(--line);border-radius:9px;min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}h2{font-size:15px;font-weight:600;letter-spacing:-.2px}.section-heading p{font-size:11px;color:var(--dim);margin-top:5px}.section-heading strong{font-size:20px;white-space:nowrap;font-weight:500}.chart-legend{display:flex;gap:18px;font-size:10px;color:#bdc9d8;white-space:nowrap}.chart-legend i{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:6px}.mint{background:var(--mint)}.violet{background:var(--violet)}.trend-chart{width:100%;height:auto;max-height:300px;display:block;overflow:visible}.gridline{stroke:#283244;stroke-width:1;stroke-dasharray:3 5}.axis-label{fill:#91a0b6;font:10px -apple-system,BlinkMacSystemFont,sans-serif}.player-bar{fill:var(--mint);opacity:.85}.player-bar.in-progress{opacity:.4}.new-bar{fill:var(--violet)}.trend-chart g:hover .player-bar,.trend-chart g:hover .new-bar{filter:brightness(1.2)}.chart-foot{display:flex;justify-content:space-between;gap:20px;color:#8295af;font-size:10px;border-top:1px solid var(--line);padding-top:15px;margin-top:12px}.secondary-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px}.money-chart{width:100%;height:115px;display:block}.turnover-bar{fill:#718dd3}.pulse-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pulse-grid>div{display:flex;flex-direction:column;gap:3px}.pulse-grid span{font-size:10px;color:var(--dim)}.pulse-grid b{font-size:22px;font-weight:550;letter-spacing:-.5px}.pulse p.muted{font-size:10px;margin-top:20px}.tag{display:inline-block;padding:3px 7px;border:1px solid #344056;border-radius:4px;font-size:9px;color:var(--dim);font-weight:400;white-space:nowrap;vertical-align:middle}.live-tag{color:var(--mint);border-color:#335a53;margin-left:7px}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:14px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid #263043;font-size:12px}tfoot td{font-weight:600;border-top:1px solid #3a4760;border-bottom:0}th{color:#8194af;font-size:10px;font-weight:500;background:#111824}th a{display:block}th[aria-sort=descending],th[aria-sort=ascending]{color:var(--mint)}th:first-child,td:first-child{text-align:left;padding-left:5px}tr:last-child td{border-bottom:0}tbody tr:hover{background:#192333}.game-link{font-weight:500;color:#d8e2f1}.game-index{font-size:10px;color:#61748f;display:inline-block;width:26px;font-weight:400}.new-number{color:#bbb2ff}.empty{text-align:center!important;color:var(--dim);padding:30px}.definition-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}.definitions h3{font-size:12px;font-weight:500;color:#c7d4e5;margin-bottom:8px}.definitions p{font-size:11px;line-height:1.8;color:#8fa0b8}.notice{background:#192638;color:#b0c6e2;border:1px solid #30445e;padding:13px 17px;border-radius:7px;font-size:12px}.notice.warning{color:#edc88b;background:#302a20;border-color:#59472a}.banner{padding:12px 38px;font-size:12px}.banner.warn{background:#352b19;color:#f3cd8c}.banner.bad{background:#3e2029;color:#ffa0ad}footer{border-top:1px solid var(--line);padding:20px 38px;display:flex;justify-content:space-between;font-size:9px;letter-spacing:1.4px;color:#61728b}footer span{letter-spacing:.1px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:15px}.tile .label{font-size:11px;color:var(--dim)}.tile .value{font-size:20px}.list{padding:0;list-style:none}.list li{padding:12px 0;border-bottom:1px solid var(--line)}.spark .spark-line{stroke:var(--mint);stroke-width:1.5}.spark .spark-dot{fill:var(--mint)}
.refresh-status{position:fixed;bottom:18px;right:18px;max-width:calc(100vw - 36px);padding:14px 20px;border:1px solid #765431;border-radius:7px;background:#382c1e;color:#f4d19c;font-size:12px;box-shadow:0 5px 24px #0008;z-index:10}.refresh-status[hidden]{display:none}
@media(min-width:1600px){.content{padding-top:44px}.metric-value{font-size:36px}}@media(max-width:1200px){.sidebar{width:188px;padding:27px 14px}.brand{font-size:10px}.workspace{margin-left:188px}.content{padding:28px 24px}.app-header{padding:0 24px}.metric-card{padding:18px 16px}.metric-value{font-size:27px}.chart-legend{gap:9px}.filters input{min-width:130px}.quick-ranges{margin-left:auto}.scope-line{flex-wrap:wrap}.section-heading{align-items:flex-start}}
@media(max-width:900px){.sidebar{position:static;width:auto;padding:17px 22px;display:flex;flex-direction:row;align-items:center;justify-content:space-between;border-right:0;border-bottom:1px solid var(--line)}.sidebar nav{flex-direction:row}.sidebar nav a{font-size:11px;padding:8px}.sidebar nav a span,.nav-label,.sidebar-foot,.sidebar nav a:last-child{display:none}.workspace{margin-left:0}.app-header{height:52px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.secondary-grid{grid-template-columns:1fr 1fr}.definition-grid{gap:18px}.section-heading{flex-wrap:wrap}.page-heading h1{font-size:30px}}
@media(max-width:600px){.content{padding:24px 15px;gap:18px}.app-header{padding:0 17px;font-size:10px}.status{font-size:9px}.status .muted{display:none}.brand{gap:9px;font-size:9px;letter-spacing:.6px}.brand small{font-size:7px}.sidebar{padding:14px 15px}.sidebar nav a{font-size:10px}.page-heading{align-items:flex-start}.page-heading h1{font-size:29px}.page-heading p{font-size:12px;max-width:240px}.export{padding:9px;font-size:10px}.eyebrow{font-size:8px}.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px}.filters label:first-child{grid-column:1/-1;min-width:0}.quick-ranges{margin-left:0;justify-content:center}.filters label{flex:1;min-width:0}.filters input{min-width:0;width:100%}.filters .button{flex:1}.scope-line{font-size:10px;gap:5px}.metric-grid{gap:10px}.metric-card{padding:16px 13px}.metric-value{font-size:25px;overflow-wrap:anywhere}.metric-label{font-size:11px}.metric-note{font-size:9px}.panel{padding:18px 15px}.section-heading{gap:10px;margin-bottom:18px}.section-heading p{font-size:10px}.section-heading h2{font-size:14px}.chart-legend{font-size:9px}.trend-chart{min-height:140px}.axis-label{font-size:12px}.chart-foot{font-size:9px}.chart-foot span:last-child{display:none}.secondary-grid,.definition-grid{grid-template-columns:1fr}.definition-grid{gap:22px}footer{padding:18px 16px;font-size:8px;gap:20px}th,td{padding:12px 10px;font-size:11px}}
.brand{display:flex;flex-direction:column;gap:6px;padding:18px 16px 10px}
.brand .cg-logo{width:150px;height:auto;display:block}
.brand small{font-size:9px;letter-spacing:2px;color:var(--dim)}
.chart{width:100%;height:auto;display:block}
.chart .gridline{stroke:#263043;stroke-width:1}
.chart .axis-label{fill:var(--dim);font-size:10px}
.chart .series{stroke-linejoin:round;stroke-linecap:round}
.game-legend{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 14px}
.game-legend a{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border:1px solid #2b3547;border-radius:999px;color:var(--dim);font-size:12px;line-height:1.2;text-decoration:none}
.game-legend a:hover{border-color:#44516a;color:var(--text)}
.game-legend a.selected{background:#263447;border-color:#4a8ff5;color:var(--text)}
.game-legend a span{color:#8d9bb0;font-size:11px;font-weight:400;font-variant-numeric:tabular-nums}
.game-legend .swatch{flex:none;border-radius:2px}
.donate-list{display:flex;flex-direction:column;gap:0;padding:6px 22px}
.donate-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--line)}
.donate-row:last-child{border-bottom:0}
.donate-asset{font-weight:600;letter-spacing:1px;color:var(--text)}
.donate-address{font-size:13px;color:var(--mint);overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
.donate-copy{padding:7px 14px;border:1px solid #344055;border-radius:5px;background:#1b2535;color:var(--text);font:inherit;font-size:12px;cursor:pointer}
.donate-copy:hover{background:#263447}
.donate-actions{display:flex;gap:8px;align-items:center}
.donate-qr{position:relative}
.donate-qr summary{list-style:none;padding:7px 14px;border:1px solid #344055;border-radius:5px;background:#1b2535;color:var(--text);font-size:12px;cursor:pointer}
.donate-qr summary::-webkit-details-marker{display:none}
.donate-qr summary:hover,.donate-qr[open] summary{background:#263447}
.donate-qr-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:10;width:220px;padding:12px;border-radius:8px;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.45);text-align:center}
.donate-qr-pop .qr{display:block;width:196px;height:196px}
.donate-qr-pop small{display:block;margin-top:6px;color:#111;font-weight:600;letter-spacing:1px}
.donate-note{margin-top:4px}
@media(max-width:600px){.donate-row{grid-template-columns:1fr auto}.donate-address{grid-column:1/-1;grid-row:2}.donate-qr-pop{width:180px}.donate-qr-pop .qr{width:156px;height:156px}}
.hit .crosshair{stroke:#4d5d78;stroke-width:1;visibility:hidden;pointer-events:none}
.hit .focus-dot{stroke:var(--panel);stroke-width:2;visibility:hidden;pointer-events:none}
.hit:hover .crosshair,.hit:hover .focus-dot{visibility:visible}
.hit .dot{pointer-events:none}.hit:hover .dot{fill-opacity:1;stroke:var(--text);stroke-width:1.5}
.chart-tip{position:fixed;left:0;top:0;z-index:20;pointer-events:none;min-width:150px;max-width:calc(100vw - 16px);padding:10px 12px;border:1px solid #344055;border-radius:7px;background:#0e1520;box-shadow:0 8px 28px #000a;font-size:11px;line-height:1.5}
.chart-tip[hidden]{display:none}
.tip-head{color:var(--dim);margin-bottom:6px;overflow-wrap:anywhere}
.tip-row{display:flex;align-items:center;gap:8px}
.tip-key{flex:none;width:12px;height:2px;border-radius:1px}.tip-key[hidden]{display:none}
.tip-name{flex:1;color:var(--dim)}
.tip-val{margin-left:14px;color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.tip-note{margin-top:6px;color:var(--warn)}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 13px}
.panel-head h2{margin:0}
.poll-countdown{font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}
.poll-countdown b{color:var(--mint);font-weight:600}
.poll-countdown.due b{color:var(--warn)}
.conclusion{font-size:13px;color:var(--text);margin-top:8px;line-height:1.5;max-width:920px}
.donut-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.donut-grid .panel{min-width:0}
.chart .donut-centre{fill:var(--text);font-size:20px;font-weight:600}
.chart .bar-label{fill:#c5d0de}
.chart .bar-pos{fill:var(--good)}.chart .bar-neg{fill:var(--bad)}.chart .bar-neutral{fill:#4a8ff5}
.chart .zero{stroke:#3a4760;stroke-width:1}
.chart .band{fill:#26324a}.chart .band-ref{stroke:#8d9bb0;stroke-width:2}
.chart .dot-in{fill:var(--mint)}.chart .dot-out{fill:var(--warn)}.chart .dot-na{fill:#6b778a}
.panel .scope-line{margin:0 0 14px}
.span-picker{flex-wrap:wrap;height:auto;min-height:39px}
.banner.sticky{position:sticky;top:0;z-index:30;font-weight:600}
.local-path{display:block;margin-top:4px;font-size:10px;color:var(--dim);white-space:normal;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}.presigned{margin-top:6px;text-align:left}.presigned summary{cursor:pointer;color:var(--dim);font-size:11px}.presigned code{display:block;max-width:420px;white-space:normal;overflow-wrap:anywhere;font-size:10px;color:#bdc9d8;user-select:all;-webkit-user-select:all}
table.log td.fields{white-space:normal;text-align:left}table.log td{vertical-align:top}table.log th:nth-child(3){text-align:left}
table.log .kv{display:inline-block;margin:0 12px 2px 0}table.log .kv b{color:var(--dim);font-weight:500;margin-right:5px}
nav.pager{flex-direction:row;flex-wrap:wrap;gap:18px;margin:14px 0;font-size:12px}nav.pager a{padding:0;font-size:12px;font-weight:500;color:var(--link);background:none}nav.pager a:hover{background:none;text-decoration:underline}nav.pager .disabled{color:#56637a}
td.label-cell{text-align:left}
@media(max-width:900px){.donut-grid{grid-template-columns:1fr}}
`;

export const INSIGHTS_JS = `
(() => {
  // Donations: copy an address. The clipboard API needs a secure context, and
  // a dashboard opened over plain http on the LAN is not one, so the fallback
  // selects the address for the reader to copy by hand.
  document.addEventListener('click', async (event) => {
    const button = event.target.closest && event.target.closest('[data-copy]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
    } catch {
      const code = button.parentElement.querySelector('.donate-address');
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      button.textContent = 'Selected - press copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  });
  const main = document.querySelector('main');
  const status = document.getElementById('refresh-status');
  let busy = false;
  async function refresh() {
    // Preserve in-progress filter edits and pointer/keyboard interactions.
    if (busy || document.hidden || document.querySelector('[data-static]') || document.querySelector('form[data-dirty]') || main.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    busy = true;
    try {
      const url = new URL(location.href); url.searchParams.set('fragment', '1');
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('Refresh failed');
      {
        const positions = [...document.querySelectorAll('.scroll')].map(el => el.scrollLeft);
        main.innerHTML = await res.text();
        document.querySelectorAll('.scroll').forEach((el, i) => el.scrollLeft = positions[i] || 0);
        // The band under the pointer was just replaced; its readout may be out of date.
        hideTip();
        // The fragment carries a freshly computed time-to-next-poll; re-anchor
        // the countdown to it rather than to the value this page loaded with.
        syncPollClock();
        if (status) status.hidden = true;
      }
    } catch {
      if (status) { status.textContent = 'Refresh failed. Showing cached figures; connection will retry automatically.'; status.hidden = false; }
    } finally { busy = false; }
  }
  // Chart hover readout. Delegated from the document, and the tooltip lives
  // outside <main>, so both survive the fragment refresh replacing the charts.
  // Every string goes in through textContent: series and game names come from
  // the upstream API. Positioned through the CSSOM, which the page's CSP allows
  // where a style attribute would be blocked.
  let tip = null, shownFor = null;
  function hideTip() { shownFor = null; if (tip) tip.hidden = true; }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function showTip(e) {
    const hit = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!hit) return hideTip();
    if (hit !== shownFor) {
      let data;
      try { data = JSON.parse(hit.dataset.tip); } catch { return hideTip(); }
      if (!data || !Array.isArray(data.rows)) return hideTip();
      if (!tip) { tip = node('div', 'chart-tip'); tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
      const parts = [node('div', 'tip-head', String(data.label ?? ''))];
      for (const r of data.rows) {
        const row = node('div', 'tip-row');
        const key = node('i', 'tip-key');
        if (r.colour) key.style.background = String(r.colour); else key.hidden = true;
        row.append(key, node('span', 'tip-name', String(r.name ?? '')), node('b', 'tip-val', String(r.value ?? '-')));
        parts.push(row);
      }
      if (data.note) parts.push(node('div', 'tip-note', String(data.note)));
      tip.replaceChildren(...parts);
      tip.hidden = false;
      shownFor = hit;
    }
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + tip.offsetWidth > vw - 8) x = e.clientX - 16 - tip.offsetWidth;
    if (y + tip.offsetHeight > vh - 8) y = e.clientY - 16 - tip.offsetHeight;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('pointermove', showTip);
  document.addEventListener('pointerdown', showTip);
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) hideTip(); });
  document.addEventListener('scroll', hideTip, true);
  document.addEventListener('input', e => { if (e.target.form) e.target.form.dataset.dirty = 'true'; });
  document.addEventListener('change', e => { if (e.target.form) e.target.form.dataset.dirty = 'true'; });
  // The poll countdown.
  //
  // The collector sleeps to a boundary of the epoch minute grid, so the page
  // can say exactly when the next tick lands. The server sends a DURATION
  // (data-next-poll-ms) and this counts it down against performance.now(),
  // which keeps the readout right on a browser whose clock disagrees with the
  // server's - the failure an absolute timestamp would show as a countdown
  // minutes out on a perfectly healthy page.
  //
  // The refresh goes out a beat AFTER the boundary: the tick has to fetch,
  // detect and write before the figures it produced can be read back, and a
  // request sent on the boundary itself returns the previous minute's data
  // and then waits a whole period to correct itself.
  var POLL_LAG_MS = 2500;
  var pollDeadline = null, pollPeriodMs = 60000;
  function syncPollClock() {
    var el = document.querySelector('[data-next-poll-ms]');
    if (!el) { pollDeadline = null; return; }
    var ms = Number(el.dataset.nextPollMs), period = Number(el.dataset.periodMs);
    if (!isFinite(ms) || ms < 0) { pollDeadline = null; return; }
    if (isFinite(period) && period > 0) pollPeriodMs = period;
    pollDeadline = performance.now() + ms;
    paintCountdown();
  }
  function paintCountdown() {
    var el = document.querySelector('[data-next-poll-ms]');
    var out = el && el.querySelector('b');
    if (!out) return;
    if (pollDeadline === null) { out.textContent = '-'; el.classList.remove('due'); return; }
    var left = pollDeadline - performance.now();
    el.classList.toggle('due', left <= 0);
    if (left <= 0) { out.textContent = 'now'; return; }
    var seconds = Math.ceil(left / 1000);
    out.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  setInterval(function () {
    if (pollDeadline === null) return;
    paintCountdown();
    if (performance.now() - pollDeadline < POLL_LAG_MS) return;
    // Advance first, then refresh: a refresh that fails - or that refresh()
    // skips because the tab is hidden or a filter is mid-edit - must not
    // leave the countdown stuck on "now" retrying four times a second.
    pollDeadline += pollPeriodMs;
    refresh();
  }, 250);
  // A page with a countdown refreshes in step with the collector above. One
  // without keeps the flat cadence. Either way it refreshes even if the
  // collector has stopped, so the stale state becomes visible.
  //
  // The promise is returned rather than dropped so a caller can wait for the
  // refresh it just triggered; nothing in the browser does, but the test
  // harness drives this callback directly.
  function pollFallback() { return pollDeadline === null ? refresh() : null; }
  setInterval(pollFallback, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  syncPollClock();
})();
`;
