/**
 * The two static files, as strings.
 *
 * Kept in the module rather than on disk so there is nothing to resolve
 * relative to a working directory, nothing to miss out of a copy, and no
 * second content type to negotiate.
 */

export const CSS = `
:root {
  --bg: #0f1115; --panel: #161a21; --line: #242a34; --text: #e6e9ef;
  --dim: #8b94a3; --good: #7ddf64; --bad: #ff6b6b; --warn: #ffb347; --link: #4f9cff;
}
@media (prefers-color-scheme: light) {
  :root { --bg: #f6f7f9; --panel: #fff; --line: #e2e5ea; --text: #16181d; --dim: #6b7280; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
header.top { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: baseline;
  padding: 12px 16px; border-bottom: 1px solid var(--line); }
header.top h1 { font-size: 15px; margin: 0; font-weight: 700; }
.dim { color: var(--dim); }
.good { color: var(--good); } .bad { color: var(--bad); } .warn { color: var(--warn); }
main { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
section.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; }
section.panel > h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--dim); margin: 0 0 10px; font-weight: 600; }
.banner { padding: 8px 16px; font-weight: 700; }
.banner.bad { background: var(--bad); color: #fff; }
.banner.warn { background: var(--warn); color: #000; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.tile { border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; }
.tile .label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.tile .value { font-size: 17px; margin-top: 2px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 4px 8px; white-space: nowrap; border-bottom: 1px solid var(--line); }
th { text-align: right; color: var(--dim); font-size: 11px; letter-spacing: .05em; font-weight: 600; }
th:first-child, td:first-child { text-align: left; }
td { text-align: right; }
tr.pending td { color: var(--dim); }
.badge { border: 1px solid var(--line); border-radius: 3px; padding: 0 5px; font-size: 11px; color: var(--dim); }
ul.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
ul.list li { border-left: 2px solid var(--line); padding-left: 10px; }
li.crit { border-left-color: var(--bad); } li.warn { border-left-color: var(--warn); }
.spark .spark-line { stroke: var(--link); stroke-width: 1.5; }
.spark .spark-dot { fill: var(--link); }
.zero { stroke: var(--line); stroke-width: 1; }
.bars .bar-total { stroke: var(--text); stroke-width: 1; }
.tick-empty { fill: var(--line); }
.legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 0; color: var(--dim); font-size: 12px; }
.legend i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 2px; }
.note { color: var(--warn); margin-top: 8px; font-size: 12px; }
.scroll { overflow-x: auto; }
`;

export const CLIENT_JS = `
// Repaint when the poller ticks - not on a timer. An idle poller should cost
// an idle browser nothing.
(function () {
  var main = document.querySelector('main');
  if (!main) return;
  var fails = 0, timer = null, busy = false;

  function refresh() {
    if (busy) return;
    busy = true;
    var url = new URL(location.href);
    url.searchParams.set('fragment', '1');
    fetch(url, { headers: { accept: 'text/html' } })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (body) { if (body !== null) main.innerHTML = body; })
      .catch(function () {})
      .then(function () { busy = false; });
  }

  try {
    var src = new EventSource('/stream');
    src.addEventListener('tick', refresh);
    src.addEventListener('alerts', refresh);
    src.onopen = function () { fails = 0; if (timer) { clearInterval(timer); timer = null; } };
    // Three consecutive failures means the stream is not coming back on its
    // own - fall back to a slow poll rather than going silently stale.
    src.onerror = function () { if (++fails >= 3 && !timer) timer = setInterval(refresh, 30000); };
  } catch (e) {
    timer = setInterval(refresh, 30000);
  }
})();
`;
