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
.local-path{display:block;margin-top:4px;font-size:10px;color:var(--dim);white-space:normal;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
table.log td.fields{white-space:normal;text-align:left}table.log td{vertical-align:top}table.log th:nth-child(3){text-align:left}
table.log .kv{display:inline-block;margin:0 12px 2px 0}table.log .kv b{color:var(--dim);font-weight:500;margin-right:5px}
nav.pager{flex-direction:row;flex-wrap:wrap;gap:18px;margin:14px 0;font-size:12px}nav.pager a{padding:0;font-size:12px;font-weight:500;color:var(--link);background:none}nav.pager a:hover{background:none;text-decoration:underline}nav.pager .disabled{color:#56637a}
td.label-cell{text-align:left}
@media(max-width:900px){.donut-grid{grid-template-columns:1fr}}
/* ---- v1.0.1 design layer ------------------------------------------------
   Named patterns (namethatui.com): Sidebar (Source List) with vibrancy,
   sticky glass header, Status Dot, Toggle Group (Segmented Control), Card,
   Badge/Pill, Banner vs Inline Alert, Toast, Hover Card, Empty State,
   Focus Ring. Layered over the rules above so it reads as one unit. */
:root{--surface-1:#111723;--surface-2:#151d2b;--stroke:rgba(148,163,184,.13);--stroke-strong:rgba(148,163,184,.26);--radius:14px;--radius-sm:9px;--ease:cubic-bezier(.2,.8,.2,1);--lift:inset 0 1px 0 rgba(255,255,255,.04),0 10px 30px -18px rgba(0,0,0,.85);--header-h:72px}
html{scrollbar-color:#2a3446 transparent}
body{background:radial-gradient(1100px 560px at 8% -12%,rgba(134,225,196,.075),transparent 62%),radial-gradient(900px 520px at 104% -8%,rgba(166,154,255,.06),transparent 58%),var(--bg);background-attachment:fixed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
::selection{background:rgba(134,225,196,.28)}
a,button,summary,.button,nav a,.quick-ranges a,tbody tr{transition:color .16s var(--ease),background-color .16s var(--ease),border-color .16s var(--ease),box-shadow .16s var(--ease),transform .16s var(--ease)}
:focus-visible,summary:focus-visible{outline:2px solid var(--mint);outline-offset:3px;border-radius:6px}
.sidebar{background:rgba(13,18,28,.74);-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);border-right:1px solid var(--stroke)}
.sidebar nav{gap:4px}
.sidebar nav a{position:relative;border-radius:var(--radius-sm)}
.sidebar nav a:hover{background:rgba(148,163,184,.08);color:var(--text)}
.sidebar nav a.active{background:linear-gradient(90deg,rgba(134,225,196,.15),rgba(134,225,196,.03));color:var(--mint)}
.sidebar nav a.active::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--mint);box-shadow:0 0 12px rgba(134,225,196,.7)}
.app-header{position:sticky;top:0;z-index:40;background:rgba(10,14,22,.72);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--stroke)}
.status-dot{box-shadow:none}
.status-dot.live{animation:presence 2.4s var(--ease) infinite}
@keyframes presence{0%{box-shadow:0 0 0 0 rgba(134,225,196,.55)}70%{box-shadow:0 0 0 7px rgba(134,225,196,0)}100%{box-shadow:0 0 0 0 rgba(134,225,196,0)}}
.status-dot.stale{box-shadow:0 0 0 4px rgba(248,200,119,.14)}
h1{letter-spacing:-1.6px}
.panel,.metric-card,.filters{border-radius:var(--radius);border:1px solid var(--stroke);background:linear-gradient(180deg,var(--surface-2),var(--surface-1));box-shadow:var(--lift)}
.metric-card:hover{border-color:var(--stroke-strong)}
.metric-card.accent{background:radial-gradient(120% 140% at 0% 0%,rgba(134,225,196,.2),transparent 60%),linear-gradient(180deg,#16292b,#122024);border-color:rgba(134,225,196,.3)}
.metric-value,.pulse-grid b,.donut-centre{font-variant-numeric:tabular-nums}
.quick-ranges{height:auto;min-height:39px;align-items:center;padding:3px;gap:2px;border:1px solid var(--stroke);border-radius:11px;background:rgba(7,10,16,.55);box-shadow:inset 0 1px 2px rgba(0,0,0,.45)}
.quick-ranges a{display:inline-flex;align-items:center;padding:7px 12px;border-radius:8px;font-size:11.5px;color:var(--dim)}
.quick-ranges a:hover{color:var(--text);background:rgba(148,163,184,.08)}
.quick-ranges a.selected{color:#fff;background:linear-gradient(180deg,#2b3b54,#223048);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 2px 8px -2px rgba(0,0,0,.7)}
.button{border-radius:var(--radius-sm)}
.button:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(134,225,196,.55)}
.button.secondary{border-color:var(--stroke-strong)}
.button.secondary:hover{background:rgba(148,163,184,.08);color:var(--text);box-shadow:none}
.filters select,.filters input{border-radius:var(--radius-sm);border-color:var(--stroke-strong);background:rgba(7,10,16,.55)}
.filters select:focus,.filters input:focus{border-color:rgba(134,225,196,.6)}
.tag{border-radius:999px;padding:3px 9px;font-size:10px;color:#aab7c9;background:rgba(148,163,184,.08);border-color:var(--stroke)}
.live-tag{color:var(--mint);background:rgba(134,225,196,.1);border-color:rgba(134,225,196,.3)}
th{background:transparent;color:#7f90aa;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--stroke-strong)}
td{border-bottom-color:var(--stroke)}
tbody tr:hover{background:rgba(148,163,184,.06)}
.banner{display:flex;align-items:center;gap:11px;border-bottom:1px solid transparent}
.banner::before{content:"!";flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;font-weight:800;color:var(--bg)}
.banner.bad::before{background:#ffa0ad}.banner.warn::before{background:#f3cd8c}
.demo-banner{padding:10px 38px;background:linear-gradient(90deg,rgba(166,154,255,.18),rgba(134,225,196,.12));border-bottom:1px solid rgba(166,154,255,.3);color:#d9d4ff;font-size:12px}
.demo-banner a{color:var(--mint);text-decoration:underline}
.notice[hidden]{display:none}.notice.dismissible{position:relative;padding-right:48px}
.notice .dismiss{position:absolute;top:7px;right:8px;width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;opacity:.65;font-size:19px;line-height:1;cursor:pointer}
.notice .dismiss:hover{opacity:1;background:rgba(148,163,184,.14)}
.banner.bad{background:linear-gradient(90deg,#3d1d28,#2a1820);border-bottom-color:rgba(255,135,150,.32)}
.banner.warn{background:linear-gradient(90deg,#372b17,#2a2216);border-bottom-color:rgba(248,200,119,.3)}
.banner.sticky{top:var(--header-h);z-index:35;box-shadow:0 8px 20px -12px rgba(0,0,0,.9)}
.notice{border-radius:10px;border-left-width:3px;background:rgba(74,143,245,.08)}
.notice.warning{background:rgba(248,200,119,.07);border-color:rgba(248,200,119,.28);border-left-color:var(--warn)}
.refresh-status{border-radius:12px;background:rgba(56,44,30,.9);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-color:rgba(248,200,119,.35);box-shadow:0 14px 34px -10px rgba(0,0,0,.8);animation:toast-in .28s var(--ease)}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.chart-tip{border-radius:10px;background:rgba(17,24,36,.94);border:1px solid var(--stroke-strong);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 14px 34px -12px rgba(0,0,0,.85)}
.empty-state{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0;white-space:normal}
.empty-state b{color:var(--text);font-size:13px;font-weight:600}
.empty-state span{font-size:11.5px;max-width:460px;line-height:1.6}
code{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c7d4e5}
.empty-state code{padding:1px 6px;border-radius:6px;background:rgba(148,163,184,.1)}
footer{border-top-color:var(--stroke)}
footer{flex-direction:column;gap:12px}
.footer-row{display:flex;justify-content:space-between;gap:20px;width:100%}
.disclaimer{margin:0;max-width:1100px;font-size:10.5px;line-height:1.6;letter-spacing:0;color:#6f7f96}
.disclaimer b{color:#8fa0b8;font-weight:600}
.auth-page{grid-template-rows:1fr auto;gap:18px}
.auth-disclaimer{max-width:560px;text-align:center;align-self:end}
footer .version{margin-left:10px;padding:2px 8px;border-radius:999px;border:1px solid var(--stroke);color:#8fa0b8;font-weight:600;letter-spacing:.4px}
@media(max-width:900px){:root{--header-h:52px}.sidebar{gap:14px;-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(13,18,28,.92);border-right:0;border-bottom:1px solid var(--stroke)}.sidebar .brand{flex:none}.sidebar nav{flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}.sidebar nav::-webkit-scrollbar{display:none}.sidebar nav a{flex:none;white-space:nowrap}.sidebar nav a.active::before{left:10px;right:10px;top:auto;bottom:2px;width:auto;height:2px}}
/* ---- components (namethatui.com): header search field, breadcrumbs,
   command palette, account popover, poll progress bar, drawer and scrim,
   dialogs, toast, tabs, switch, form fields, sign-in form, level meter,
   callout, scrollspy table of contents, accordion, timeline, overflow menu,
   table search field, pagination. */
.icon{display:inline-block;vertical-align:-3px;flex:none}
kbd{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 6px;border-radius:5px;border:1px solid var(--stroke-strong);background:rgba(148,163,184,.08);color:#aab7c9}
.app-header{gap:18px;position:sticky}
.breadcrumbs{flex:1;min-width:0}
.breadcrumbs ol{display:flex;align-items:center;gap:0;margin:0;padding:0;list-style:none;white-space:nowrap;overflow:hidden}
.breadcrumbs li{display:flex;align-items:center;min-width:0}
.breadcrumbs li+li::before{content:"/";margin:0 12px;color:#4d5a70}
.breadcrumbs li:last-child{overflow:hidden;text-overflow:ellipsis}
.breadcrumbs a{color:var(--dim)}.breadcrumbs a:hover{color:var(--text)}
.search-trigger{display:inline-flex;align-items:center;gap:9px;height:36px;min-width:240px;padding:0 8px 0 12px;border:1px solid var(--stroke-strong);border-radius:10px;background:rgba(7,10,16,.55);color:var(--dim);font-size:12px;cursor:pointer}
.search-trigger span{flex:1;text-align:left}
.search-trigger:hover{border-color:rgba(134,225,196,.45);color:var(--text)}
.status .status-text{white-space:nowrap}
.signin-off{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid rgba(248,200,119,.3);background:rgba(248,200,119,.08);color:#e9c886;font-size:11px;white-space:nowrap}
.signin-off:hover{color:var(--warn);border-color:rgba(248,200,119,.55)}
details.account,details.overflow{position:relative}
details.account>summary,details.overflow>summary{list-style:none;cursor:pointer}
details.account>summary::-webkit-details-marker,details.overflow>summary::-webkit-details-marker{display:none}
details.account>summary{display:flex;align-items:center;gap:8px;padding:3px 10px 3px 3px;border-radius:999px;border:1px solid var(--stroke)}
details.account>summary:hover,details.account[open]>summary{border-color:var(--stroke-strong);background:rgba(148,163,184,.06)}
.avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#86e1c4,#a69aff);color:#0c1019;font-weight:750;font-size:12px}
.account-name{font-size:12px;color:var(--text);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menu{position:absolute;right:0;top:calc(100% + 8px);z-index:70;min-width:210px;padding:6px;border-radius:12px;border:1px solid var(--stroke-strong);background:rgba(19,26,38,.97);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 18px 40px -14px rgba(0,0,0,.85);animation:pop-in .16s var(--ease)}
.menu-head{padding:8px 10px 10px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--stroke);margin-bottom:4px}
.menu-head b{color:var(--text)}
.menu a,.menu button{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:#d0d9e5;font-size:12px;text-align:left;cursor:pointer}
.menu a:hover,.menu button:hover{background:rgba(148,163,184,.1);color:var(--text)}
.menu form{margin:0}
@keyframes pop-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.poll-progress{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:transparent;pointer-events:none}
.poll-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,rgba(134,225,196,.15),var(--mint));box-shadow:0 0 8px rgba(134,225,196,.6);transition:width 1s linear}
.nav-toggle{display:none;place-items:center;width:36px;height:36px;padding:0;border:1px solid var(--stroke-strong);border-radius:10px;background:transparent;color:var(--text);cursor:pointer}
.scrim{position:fixed;inset:0;z-index:55;background:rgba(3,6,12,.6);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);animation:fade-in .2s var(--ease)}
.scrim[hidden]{display:none}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
dialog{color:var(--text)}
dialog::backdrop{background:rgba(3,6,12,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.palette{width:min(640px,92vw);max-height:min(520px,80vh);margin:12vh auto auto;padding:0;border-radius:16px;border:1px solid var(--stroke-strong);background:rgba(17,23,35,.98);box-shadow:0 30px 70px -20px rgba(0,0,0,.9);overflow:hidden}
.palette[open]{display:flex;flex-direction:column;animation:pop-in .18s var(--ease)}
.palette-field{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--stroke);color:var(--dim)}
.palette-field input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font-size:15px}
.palette-list{list-style:none;margin:0;padding:6px;overflow-y:auto}
.palette-list a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:9px;color:#d0d9e5;font-size:13px}
.palette-list li[aria-selected=true] a,.palette-list a:hover{background:rgba(134,225,196,.1);color:var(--text)}
.palette-kind{font-size:10px;color:var(--dim);padding:2px 8px;border-radius:999px;border:1px solid var(--stroke)}
.palette-empty{padding:18px 12px;color:var(--dim);font-size:12px}
.palette-hint{margin:0;padding:10px 16px;border-top:1px solid var(--stroke);font-size:10.5px;color:var(--dim)}
.palette-hint kbd{margin-right:2px}
.dialog{width:min(460px,92vw);padding:24px;border-radius:16px;border:1px solid var(--stroke-strong);background:linear-gradient(180deg,var(--surface-2),var(--surface-1));box-shadow:0 30px 70px -20px rgba(0,0,0,.9)}
.dialog[open]{animation:pop-in .18s var(--ease)}
.dialog h3{font-size:16px;margin-bottom:6px}
.dialog form{display:flex;flex-direction:column;gap:14px}
.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
.toast{position:fixed;left:50%;bottom:22px;z-index:80;transform:translateX(-50%);max-width:min(520px,92vw);padding:12px 18px;border-radius:12px;border:1px solid rgba(134,225,196,.35);background:rgba(18,40,38,.95);color:#bff0df;font-size:12.5px;box-shadow:0 16px 36px -12px rgba(0,0,0,.85);animation:toast-up .28s var(--ease);transition:opacity .35s var(--ease),transform .35s var(--ease)}
.toast.leaving{opacity:0;transform:translate(-50%,8px)}
.toast[hidden]{display:none}
@keyframes toast-up{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translateX(-50%)}}
/* The base sheet styles every <nav> as the sidebar's list; these navs are not. */
.tabs,.breadcrumbs,.toc{flex-direction:row;gap:0}
.breadcrumbs a,.tabs a,.toc a,.breadcrumbs a:hover,.tabs a:hover,.toc a:hover{background:none}
.breadcrumbs a{padding:0;border-radius:0;font-weight:inherit;font-size:inherit}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--stroke);margin-top:-6px}
.tabs a{padding:10px 14px;border-radius:0;color:var(--dim);font-size:13px;font-weight:550;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a:hover{color:var(--text)}
.tabs a.selected{color:var(--text);border-bottom-color:var(--mint)}
.switch{position:relative;flex:none;display:inline-block;width:46px;height:26px;border-radius:999px;background:#2a3446;border:1px solid var(--stroke-strong);transition:background .2s var(--ease)}
.switch span{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#c9d4e3;box-shadow:0 2px 6px rgba(0,0,0,.5);transition:transform .2s var(--ease)}
.switch.on{background:rgba(134,225,196,.35);border-color:rgba(134,225,196,.6)}
.switch.on span{transform:translateX(20px);background:var(--mint)}
.setting-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-top:1px solid var(--stroke)}
.panel>.setting-row:first-child,.panel>h2+.setting-row{border-top:0}
.setting-row h2{font-size:15px}.setting-row h3{font-size:13px;font-weight:600;margin-bottom:4px}
.setting-row p{font-size:12px;max-width:640px}
.panel h2.gap{margin-top:26px}
.danger-zone{margin-top:8px}
.form-grid{display:grid;gap:16px;max-width:520px;padding:18px 0 6px;border-top:1px solid var(--stroke)}
.form-grid h3{font-size:14px;font-weight:600}
.field{display:flex;flex-direction:column;gap:7px}
.field-label{font-size:11px;font-weight:600;letter-spacing:.4px;color:#b5c2d4}
.field input{height:40px;width:100%;padding:0 12px;border-radius:var(--radius-sm);border:1px solid var(--stroke-strong);background:rgba(7,10,16,.55);color:var(--text);font-size:13px}
.field input:focus{outline:none;border-color:rgba(134,225,196,.65);box-shadow:0 0 0 3px rgba(134,225,196,.15)}
.field-help{font-size:11px;color:var(--dim);line-height:1.5}
.field-error{display:flex;align-items:center;gap:8px;margin:0;padding:9px 12px;border-radius:9px;background:rgba(255,135,150,.1);border:1px solid rgba(255,135,150,.32);color:#ffb3bd;font-size:12px}
.field-error::before{content:"!";display:inline-grid;place-items:center;flex:none;width:16px;height:16px;border-radius:50%;background:#ffa0ad;color:var(--bg);font-size:10px;font-weight:800}
.password-wrap{position:relative;display:block}
.password-wrap input{padding-right:44px}
.reveal{position:absolute;right:4px;top:4px;width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--dim);cursor:pointer}
.reveal:hover,.reveal[aria-pressed=true]{color:var(--mint);background:rgba(134,225,196,.08)}
.check{display:flex;align-items:center;gap:9px;font-size:12.5px;color:#c7d4e5;cursor:pointer}
.check input{width:16px;height:16px;accent-color:var(--mint)}
.button.block{display:block;width:100%;text-align:center;padding:12px}
.button.small{padding:7px 12px;font-size:11px}
.button.danger{background:#ff8796;color:#2a0d13}
.button.danger:hover{background:#ffa0ad;color:#2a0d13;box-shadow:0 8px 18px -8px rgba(255,135,150,.6)}
.button .icon{margin-right:6px}
.callout{margin-top:18px;padding:14px 16px;border-radius:11px;border:1px solid rgba(166,154,255,.28);border-left:3px solid var(--violet);background:rgba(166,154,255,.07);font-size:12px;line-height:1.6;color:#cdd6e4}
.callout b{color:var(--text)}
meter.level{width:200px;height:10px;border-radius:999px;background:#222c3c;border:0}
meter.level::-webkit-meter-bar{background:#222c3c;border-radius:999px;border:0;height:10px}
meter.level::-webkit-meter-optimum-value{background:var(--mint);border-radius:999px}
meter.level::-webkit-meter-suboptimum-value{background:var(--warn);border-radius:999px}
meter.level::-webkit-meter-even-less-good-value{background:var(--bad);border-radius:999px}
meter.level::-moz-meter-bar{background:var(--mint);border-radius:999px}
.auth-page{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.auth-card{width:min(400px,100%);display:flex;flex-direction:column;gap:18px;padding:32px 28px;border-radius:18px;border:1px solid var(--stroke-strong);background:linear-gradient(180deg,var(--surface-2),var(--surface-1));box-shadow:0 30px 70px -24px rgba(0,0,0,.9)}
.auth-card .cg-logo{width:150px;height:auto}
.auth-card h1{font-size:28px}
.auth-card .dim{font-size:12.5px;margin-top:6px}
.auth-note{font-size:11px;color:var(--dim);line-height:1.6}
.with-toc{display:block}
.toc{display:none}
@media(min-width:1400px){.with-toc{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:28px;align-items:start}
.toc-main{display:flex;flex-direction:column;gap:24px;min-width:0}
.toc{display:block;position:sticky;top:calc(var(--header-h) + 18px);max-height:calc(100vh - var(--header-h) - 36px);overflow-y:auto;padding:4px 0}}
.toc-main{display:flex;flex-direction:column;gap:24px;min-width:0}
.toc-title{font-size:10px;letter-spacing:1.6px;font-weight:650;color:#6e7f99;text-transform:uppercase;margin-bottom:10px}
.toc ol{list-style:none;margin:0;padding:0;border-left:1px solid var(--stroke)}
.toc a{display:block;padding:5px 0 5px 14px;margin-left:-1px;border-radius:0;border-left:2px solid transparent;color:var(--dim);font-size:11.5px;font-weight:400;line-height:1.4}
.toc a:hover{color:var(--text)}
.toc a[aria-current]{color:var(--mint);border-left-color:var(--mint)}
.chart-panel,.definitions{scroll-margin-top:calc(var(--header-h) + 16px)}
.accordion-group{display:flex;flex-direction:column}
.accordion{border-top:1px solid var(--stroke)}
.accordion:last-child{border-bottom:1px solid var(--stroke)}
.accordion summary{display:flex;align-items:center;justify-content:space-between;padding:14px 2px;cursor:pointer;list-style:none;font-size:13px;font-weight:600;color:#c7d4e5}
.accordion summary::-webkit-details-marker{display:none}
.accordion summary::after{content:"";width:8px;height:8px;border-right:2px solid var(--dim);border-bottom:2px solid var(--dim);transform:rotate(45deg);transition:transform .2s var(--ease);margin-right:6px}
.accordion[open] summary::after{transform:rotate(-135deg)}
.accordion summary:hover{color:var(--text)}
.fold>summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:0 16px;cursor:pointer;list-style:none;padding:0}
.fold>summary::-webkit-details-marker{display:none}
.fold>summary h2{font-size:14px;grid-column:1}
.fold>summary .conclusion{display:block;grid-column:1}
.fold>summary .fold-arrow{grid-column:2;grid-row:1;width:9px;height:9px;margin:5px 8px 0 0;border-right:2px solid var(--dim);border-bottom:2px solid var(--dim);transform:rotate(45deg);transition:transform .2s var(--ease),border-color .16s var(--ease)}
.fold>summary:hover .fold-arrow{border-color:var(--text)}
.fold[open]>summary{margin-bottom:22px}
.fold[open]>summary .fold-arrow{transform:rotate(-135deg);margin-top:9px}
.fold-more>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:12px 0 2px;font-size:12px;color:var(--dim)}
.fold-more>summary::-webkit-details-marker{display:none}
.fold-more>summary::after{content:"";width:7px;height:7px;margin-top:-3px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .2s var(--ease)}
.fold-more[open]>summary::after{transform:rotate(-135deg);margin-top:3px}
.fold-more>summary:hover{color:var(--text)}
.fold-more .when-open{display:none}
.fold-more[open] .when-open{display:inline}
.fold-more[open] .when-closed{display:none}
.stars{color:#f5c542;letter-spacing:1px;font-size:14px;white-space:nowrap}
.stars-off{color:rgba(148,163,184,.28)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;line-height:1.5;border:1px solid var(--stroke-strong);color:var(--dim);white-space:nowrap}
.pill.live{color:var(--mint);border-color:rgba(134,225,196,.4);background:rgba(134,225,196,.08)}
.engine-link{color:var(--link);white-space:nowrap}
.model{white-space:nowrap}
.model.split{color:var(--violet)}
.accordion p{padding:0 2px 16px;font-size:12px;line-height:1.8;color:#8fa0b8;max-width:900px}
.timeline{position:relative;padding-left:22px}
.timeline::before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:2px;border-radius:2px;background:linear-gradient(180deg,rgba(134,225,196,.5),rgba(148,163,184,.12))}
.timeline li{position:relative;border-bottom:0;padding:9px 0}
.timeline li::before{content:"";position:absolute;left:-20px;top:15px;width:10px;height:10px;border-radius:50%;background:var(--surface-1);border:2px solid var(--mint)}
.timeline li.warn::before{border-color:var(--warn)}
.heading-actions{display:flex;align-items:center;gap:8px}
details.overflow>summary{display:grid;place-items:center;width:38px;height:38px;padding:0}
.panel-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.table-tools{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.search-field{display:inline-flex;align-items:center;gap:8px;height:36px;width:min(320px,100%);padding:0 12px;border-radius:10px;border:1px solid var(--stroke-strong);background:rgba(7,10,16,.55);color:var(--dim)}
.search-field input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:12.5px}
.search-field:focus-within{border-color:rgba(134,225,196,.6)}
tr[hidden]{display:none}
nav.pager{gap:6px}
nav.pager a,nav.pager .disabled{padding:7px 13px;border-radius:9px;border:1px solid var(--stroke-strong);font-size:11.5px}
nav.pager a:hover{border-color:rgba(134,225,196,.5);color:var(--text)}
nav.pager .disabled{opacity:.4}
.game-legend a,.label-cell{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1100px){.search-trigger{min-width:0}.search-trigger span,.search-trigger kbd{display:none}.search-trigger{width:36px;padding:0;justify-content:center}}
@media(max-width:900px){.status .status-text,.account-name{display:none}
html.js .nav-toggle{display:grid}
html.js .sidebar{position:fixed;inset:0 auto 0 0;z-index:60;width:min(290px,86vw);flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;padding:24px 18px;border-right:1px solid var(--stroke-strong);border-bottom:0;background:rgba(13,18,28,.98);transform:translateX(-102%);transition:transform .25s var(--ease);box-shadow:24px 0 60px -20px rgba(0,0,0,.9)}
html.js body.nav-open .sidebar{transform:none}
html.js .sidebar nav{flex-direction:column;overflow:visible;-webkit-mask-image:none;mask-image:none;margin-top:18px}
html.js .sidebar nav a{font-size:13px;padding:11px 12px;white-space:normal}
html.js .sidebar nav a span{display:inline-block}
html.js .sidebar nav a:last-child{display:block}
html.js .sidebar nav a.active::before{left:0;right:auto;top:10px;bottom:10px;width:3px;height:auto}}
@media(max-width:600px){.app-header{gap:10px}.breadcrumbs li:not(:last-child){display:none}.setting-row{flex-wrap:wrap}.form-grid{max-width:none}.heading-actions{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

export const INSIGHTS_JS = `
(() => {
  // Scripts run: styles that need them (the mobile drawer) may apply.
  if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add('js');
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
  // The demo site (a static copy of the dashboard, html[data-demo]) has no
  // server to post to: every form says so instead. Capture phase, so it runs
  // before any other submit handler.
  document.addEventListener('submit', (event) => {
    if (!document.documentElement || !document.documentElement.hasAttribute || !document.documentElement.hasAttribute('data-demo')) return;
    event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const note = document.getElementById('refresh-status');
    if (note) { note.textContent = 'This is a demo with made-up data, so changes and downloads from forms are turned off.'; note.hidden = false; setTimeout(() => { note.hidden = true; }, 4000); }
  }, true);
  // Dismissing a standing warning posts to /dismiss (views/parts.mjs), where
  // it is kept for everyone. With scripts it happens in place; without, the
  // form posts and the page comes back without the warning.
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form || !form.matches || !form.matches('form[data-dismiss-form]')) return;
    event.preventDefault();
    const notice = form.closest('[data-dismiss-key]');
    if (notice) notice.hidden = true;
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)) });
      if (!res.ok) throw new Error('Dismiss failed');
    } catch {
      // Not saved, so do not pretend: bring the warning back and say so.
      if (notice) notice.hidden = false;
      if (status) { status.textContent = 'Could not dismiss that warning. Try again.'; status.hidden = false; setTimeout(() => { status.hidden = true; }, 4000); }
    }
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
      // Signed out meanwhile (session expired, or signed out elsewhere):
      // reload, and the server sends this tab to the sign-in page.
      if (res.status === 401) { location.reload(); return; }
      if (!res.ok) throw new Error('Refresh failed');
      {
        const positions = [...document.querySelectorAll('.scroll')].map(el => el.scrollLeft);
        // Accordions the reader opened stay open through the refresh.
        const opened = [...document.querySelectorAll('details[id][open]')].map(d => d.id);
        main.innerHTML = await res.text();
        opened.forEach((id) => { const d = document.getElementById(id); if (d) d.open = true; });
        document.querySelectorAll('.scroll').forEach((el, i) => el.scrollLeft = positions[i] || 0);
        // Anything drawn client-side (charts.js) was just replaced; let it redraw.
        document.dispatchEvent(new CustomEvent('stake:refreshed'));
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
  // ---- interface patterns (namethatui.com). Every one of these is an
  // enhancement: without JavaScript the palette is simply absent, dialogs open
  // through their links, the drawer is the scrolling tab bar, and forms post.
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  // Command palette: Cmd/Ctrl+K, or "/" outside a field. Every page and game,
  // filtered as you type; arrows move, Enter opens, Esc closes.
  let paletteIndex = 0;
  function paletteItems() { try { return JSON.parse(($('[data-palette-items]') || {}).textContent || '[]'); } catch { return []; } }
  function renderPalette() {
    const input = $('[data-palette-input]'), list = $('[data-palette-list]');
    if (!input || !list) return;
    const q = input.value.trim().toLowerCase();
    const found = paletteItems().filter((it) => !q || String(it.label).toLowerCase().includes(q)).slice(0, 12);
    paletteIndex = Math.max(0, Math.min(paletteIndex, found.length - 1));
    list.replaceChildren(...found.map((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === paletteIndex));
      const a = document.createElement('a');
      a.href = it.href;
      a.textContent = it.label;
      const kind = document.createElement('span');
      kind.className = 'palette-kind';
      kind.textContent = it.kind;
      a.append(kind);
      li.append(a);
      return li;
    }));
    if (!found.length) { const li = document.createElement('li'); li.className = 'palette-empty'; li.textContent = 'Nothing matches.'; list.append(li); }
  }
  function openPalette() {
    const dlg = $('#palette');
    if (!dlg || typeof dlg.showModal !== 'function' || dlg.open) return;
    paletteIndex = 0;
    dlg.showModal();
    const input = $('[data-palette-input]');
    if (input) { input.value = ''; renderPalette(); input.focus(); }
  }

  // Navigation drawer (hamburger) on narrow screens, over a scrim.
  function setDrawer(open) {
    if (!document.body) return;
    document.body.classList.toggle('nav-open', open);
    const toggle = $('[data-nav-toggle]');
    if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); }
    const scrim = $('[data-scrim]');
    if (scrim) scrim.hidden = !open;
  }

  document.addEventListener('keydown', (e) => {
    const t = e.target || {};
    const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName || '') || t.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); return; }
    const dlg = $('#palette');
    if (dlg && dlg.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); paletteIndex += e.key === 'ArrowDown' ? 1 : -1; renderPalette(); return; }
    if (dlg && dlg.open && e.key === 'Enter') { const a = $('[aria-selected="true"] a', dlg); if (a) { e.preventDefault(); location.href = a.href; } return; }
    if (e.key === 'Escape') { setDrawer(false); $$('details.account[open], details.overflow[open]').forEach((d) => d.removeAttribute('open')); }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-palette-input]')) { paletteIndex = 0; renderPalette(); }
    // Search field over a table: hide the rows that do not match.
    if (t.matches('[data-filter-table]')) {
      const q = t.value.trim().toLowerCase();
      const table = $(t.dataset.filterTable);
      if (!table) return;
      let shown = 0;
      $$('tbody tr', table).forEach((tr) => { const hit = !q || tr.textContent.toLowerCase().includes(q); tr.hidden = !hit; if (hit) shown++; });
      const count = $('[data-filter-count]');
      if (count) count.textContent = q ? shown + ' shown' : '';
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    // A popover (account menu, overflow menu) closes on any click outside it.
    $$('details.account[open], details.overflow[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
    if (t.closest('[data-palette-open]')) { openPalette(); return; }
    const pal = $('#palette');
    if (pal && pal.open && e.target === pal) { pal.close(); return; }
    if (t.closest('[data-nav-toggle]')) { setDrawer(!document.body.classList.contains('nav-open')); return; }
    if (t.closest('[data-scrim]') || (t.closest('.sidebar nav a'))) setDrawer(false);
    const opener = t.closest('[data-dialog]');
    if (opener) {
      const dlg = document.getElementById(opener.dataset.dialog);
      if (dlg && typeof dlg.showModal === 'function') { e.preventDefault(); if (dlg.open) dlg.close(); dlg.showModal(); const input = $('input:not([type=hidden])', dlg); if (input) input.focus(); }
      return;
    }
    const closer = t.closest('[data-dialog-close]');
    if (closer && closer.closest('dialog')) { e.preventDefault(); closer.closest('dialog').close(); return; }
    const reveal = t.closest('[data-reveal]');
    if (reveal) {
      const input = reveal.parentElement && $('input', reveal.parentElement);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.setAttribute('aria-pressed', String(show));
      reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      reveal.title = show ? 'Hide password' : 'Show password';
      return;
    }
  });

  // Poll progress bar: fills towards the collector's next poll, timed from
  // the moment the page was served (a fill, like the countdown).
  let barDeadline = null, barPeriod = 0;
  function syncPollBar() {
    const el = $('[data-poll-bar]');
    const ms = el ? Number(el.dataset.nextPollMs) : NaN, period = el ? Number(el.dataset.periodMs) : NaN;
    barDeadline = el && ms >= 0 && period > 0 ? performance.now() + ms : null;
    barPeriod = period;
    paintPollBar();
  }
  function paintPollBar() {
    const el = $('[data-poll-bar]');
    if (!el || barDeadline === null) return;
    let left = barDeadline - performance.now();
    while (left < 0) { barDeadline += barPeriod; left += barPeriod; }
    const done = Math.max(0, Math.min(100, 100 - (left / barPeriod) * 100));
    const bar = $('span', el);
    if (bar) bar.style.width = done.toFixed(1) + '%';
    el.setAttribute('aria-valuenow', String(Math.round(done)));
  }
  setInterval(paintPollBar, 1000);

  // Scrollspy: the "On this page" list follows the section being read.
  let spy = null;
  function watchSections() {
    if (spy) { spy.disconnect(); spy = null; }
    const links = $$('.toc a[href^="#"]');
    if (!links.length || typeof IntersectionObserver !== 'function') return;
    spy = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id));
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    links.forEach((a) => { const el = document.getElementById(a.getAttribute('href').slice(1)); if (el) spy.observe(el); });
  }

  // A result banner from a settings form fades after a few seconds, and its
  // flag leaves the address bar so a reload does not show it again.
  function settleToasts() {
    const toast = $('[data-toast]');
    if (!toast) return;
    if (typeof history !== 'undefined' && history.replaceState && typeof location.search === 'string' && /[?&](ok|error)=/.test(location.search)) {
      const url = new URL(location.href);
      ['ok', 'error', 'form', 'confirm'].forEach((p) => url.searchParams.delete(p));
      history.replaceState(null, '', url.pathname + url.search);
    }
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => { toast.hidden = true; }, 400); }, 5000);
  }

  // A dialog the server opened (no-JS path, or a form error inside it)
  // becomes a proper modal once scripts run.
  function upgradeDialogs() {
    $$('dialog.dialog[open]').forEach((d) => { if (typeof d.showModal === 'function') { d.close(); d.showModal(); } });
  }

  function enhance() { syncPollBar(); watchSections(); }
  document.addEventListener('stake:refreshed', () => { setDrawer(false); enhance(); });
  enhance();
  settleToasts();
  upgradeDialogs();
})();
`;
