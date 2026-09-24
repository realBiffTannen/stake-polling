/**
 * A made-up studio for the demo dashboard: twenty fictional games, their bet
 * modes, and every figure the Engine API would report for them.
 *
 * Nothing here is real. It is generated from a fixed seed, so a demo built
 * twice from the same `now` is the same demo, and it is shaped like a real
 * studio: a daily cycle of players, busier weekends, feature buys that pay
 * out lumpily, big wins that turn an hour red.
 *
 * Two levels of detail:
 *   days    every game and mode, per UTC day, for the last 62 days
 *   slots   the same, per 2.5-minute poll slot, for the last 4 days - what
 *           the collector's trail, the hourly charts and the tape read
 * The days that have slots are the sums of their slots, so the API's range
 * totals, the month-to-date roster and the trail all agree the way the real
 * ones do.
 *
 * `api(model)` answers the five calls the collector makes (src/api/client.mjs)
 * with the real response shapes (test/fixtures/live.mjs), as of `model.now`,
 * which the demo build moves forward one poll at a time.
 */

const DAY_MS = 86_400_000;
const SLOT_MS = 150_000;
const SLOTS_PER_DAY = DAY_MS / SLOT_MS;
const UNITS = 1_000_000; // micro-dollars per dollar, as the API reports money
export const DEMO_TEAM = 'demo-studio';
const HISTORY_DAYS = 62;
const SLOT_DAYS = 4;

export const DEMO_GAMES = [
  'Berry Bonanza', 'Pixel Geyser', 'Lunar Blossom', 'Metro Night Run', 'Neon Koi', 'Copper Canyon', 'Harbor Lights',
  'Glacier Gold', 'Velvet Vault', 'Solar Sprint', 'Jade Jungle', 'Thunder Mesa', 'Coral Crown', 'Aurora Arcade',
  'Midnight Mint', 'Pepper Rush', 'Orbit Orchard', 'Tidal Treasure', 'Ember Isle', 'Frost Fortune',
];
// In the catalogue but not live yet, for the overview's "not yet live" table.
const UNRELEASED = ['Hippo Hustle', 'Comet Carnival'];

const BUYS = [['FREE_SPINS', 80, 120], ['BONUS_HUNT', 40, 60], ['SUPER_BONUS', 250, 400], ['HOLD_AND_WIN', 120, 180], ['WHEEL_BUY', 150, 250]];

export const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dayStart = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
const monthStart = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

/** mulberry32: small, fast, and the same numbers for the same seed everywhere. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => { const u = Math.max(next(), 1e-12), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const poisson = (lambda) => {
    if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
    let k = 0, p = 1; const L = Math.exp(-lambda);
    do { k++; p *= next(); } while (p > L);
    return k - 1;
  };
  return { next, normal, poisson, between: (a0, b0) => a0 + (b0 - a0) * next(), logNormal: (s) => Math.exp(s * normal() - (s * s) / 2) };
}

/** Busier in the European and American evening, quietest before dawn UTC. */
function diurnal(ms) {
  const h = (ms % DAY_MS) / 3_600_000;
  return 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (h - 21)) / 24));
}

function gameConfig(name, index, r) {
  const rtp = Math.round(r.between(0.945, 0.9675) * 10000) / 10000;
  const modes = [{ mode: 'BASE', cost: 1, share: 0 }];
  if (r.next() < 0.45) modes.push({ mode: 'ANTE', cost: r.next() < 0.5 ? 1.25 : 2, share: 0 });
  const buyCount = 1 + Math.floor(r.next() * 3);
  const pool = [...BUYS].sort(() => r.next() - 0.5).slice(0, buyCount);
  for (const [mode, lo, hi] of pool) modes.push({ mode, cost: Math.round(r.between(lo, hi) / 5) * 5, share: 0 });
  // Base play carries most of the turnover; buys split the rest.
  const baseShare = r.between(0.52, 0.78);
  const ante = modes.find((m) => m.mode === 'ANTE');
  if (ante) ante.share = r.between(0.05, 0.12);
  const buys = modes.filter((m) => m.cost > 5);
  const buyTotal = 1 - baseShare - (ante?.share ?? 0);
  const weights = buys.map(() => r.between(0.5, 1.5));
  buys.forEach((m, i) => { m.share = (buyTotal * weights[i]) / weights.reduce((a, b) => a + b, 0); });
  modes[0].share = baseShare;
  return {
    name, slug: slugOf(name), index, rtp, modes,
    image: `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
    // Month-to-date turnover this game is heading for, in dollars.
    mtdTarget: r.between(750_000, 2_150_000),
    avgBet: r.between(0.6, 2.8),
    baseSigma: r.between(8, 40),
    betsPerPlayerDay: r.between(45, 120),
    rating: Math.round(r.between(20, 45)),
  };
}

/**
 * One slot or day of one mode: turnover, bets, house profit and expected
 * profit, in API units. `scale` is that period's expected turnover in dollars.
 */
function period(m, cfg, scale, r) {
  const unit = cfg.avgBet * m.cost;
  if (m.cost > 5) {
    // Feature buys: a whole number of them, each paying out lumpily.
    const n = r.poisson(scale / unit);
    let turnover = 0, payout = 0;
    for (let i = 0; i < Math.min(n, 400); i++) { turnover += unit; payout += unit * cfg.rtp * r.logNormal(0.95); }
    if (n > 400) { const extra = (n - 400) * unit; turnover += extra; payout += extra * cfg.rtp * (1 + 0.95 * r.normal() / Math.sqrt(n - 400)); }
    return { count: n, turnover, profit: turnover - payout, expected: turnover * (1 - cfg.rtp) };
  }
  const turnover = scale * r.logNormal(0.18);
  const count = Math.max(0, Math.round(turnover / unit));
  const sigma = m.mode === 'ANTE' ? cfg.baseSigma * 0.7 : cfg.baseSigma;
  // Now and then a big base-game win, a few hundred to a few thousand x. It
  // is paid for out of the ordinary payouts - its expected cost comes off them -
  // so the long-run RTP stays the game's RTP and only the timing is lumpy.
  const bigChance = Math.min(0.5, count / 60_000);
  const bigMean = unit * 2125;
  let payout = turnover * cfg.rtp * (1 + (sigma * r.normal()) / Math.sqrt(Math.max(count, 1)) * 0.35) - bigChance * bigMean;
  if (count > 0 && r.next() < bigChance) payout += unit * r.between(250, 4000);
  return { count, turnover, profit: turnover - Math.max(0, payout), expected: turnover * (1 - cfg.rtp) };
}

/**
 * The moment the demo snapshot is taken. Normally the build time; in a
 * month's first four days, the same time of day on the last day of the
 * month before, so month-to-date figures are a full month's worth - an
 * operator opening a demo sees a studio in mid-stride, not one that is two
 * hours into October.
 */
export function demoMoment(realNow) {
  const day = new Date(realNow).getUTCDate();
  return day >= 5 ? realNow : realNow - day * DAY_MS;
}

/**
 * @param {{ now?: number, seed?: number }} [opts]
 */
export function buildModel({ now = Date.now(), seed = 20260923 } = {}) {
  const r = rng(seed);
  const games = DEMO_GAMES.map((name, i) => gameConfig(name, i, r));
  const today = dayStart(now);
  const firstDay = today - (HISTORY_DAYS - 1) * DAY_MS;
  const slotFrom = today - (SLOT_DAYS - 1) * DAY_MS;
  // Per-day turnover so the month-to-date lands on the target, whatever day of
  // the month the demo is built: at least a day's worth, so the 1st still shows
  // a full-sized studio.
  const monthDays = Math.max(1, (now - monthStart(now)) / DAY_MS);

  const days = {}; // days[slug][dayIndex][mode] = { count, turnover, profit, expected }
  const slots = {}; // slots[slug][slotIndex][mode] = ...
  for (const g of games) {
    const perDay = g.mtdTarget / monthDays;
    days[g.slug] = [];
    slots[g.slug] = [];
    for (let d = 0; d < HISTORY_DAYS; d++) {
      const dayMs = firstDay + d * DAY_MS;
      const weekday = new Date(dayMs).getUTCDay();
      const dayScale = perDay * (weekday === 0 || weekday === 6 ? 1.15 : 0.94) * r.logNormal(0.14) * (0.85 + 0.15 * (d / HISTORY_DAYS));
      if (dayMs < slotFrom) {
        days[g.slug][d] = Object.fromEntries(g.modes.map((m) => [m.mode, period(m, g, dayScale * m.share, r)]));
        continue;
      }
      // A recent day: build it from its 576 poll slots, and make the day their sum.
      const weights = Array.from({ length: SLOTS_PER_DAY }, (_, s) => diurnal(dayMs + s * SLOT_MS) * r.logNormal(0.3));
      const total = weights.reduce((a, b) => a + b, 0);
      const sums = Object.fromEntries(g.modes.map((m) => [m.mode, { count: 0, turnover: 0, profit: 0, expected: 0 }]));
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const cell = Object.fromEntries(g.modes.map((m) => [m.mode, period(m, g, (dayScale * m.share * weights[s]) / total, r)]));
        slots[g.slug][(d - (HISTORY_DAYS - SLOT_DAYS)) * SLOTS_PER_DAY + s] = cell;
        for (const m of g.modes) for (const f of ['count', 'turnover', 'profit', 'expected']) sums[m.mode][f] += cell[m.mode][f];
      }
      days[g.slug][d] = sums;
    }
  }
  return { now, seed, games, days, slots, firstDay, slotFrom, unreleased: UNRELEASED };
}

const ZERO = () => ({ count: 0, turnover: 0, profit: 0, expected: 0 });
function add(into, cell) { for (const f of ['count', 'turnover', 'profit', 'expected']) into[f] += cell[f]; }

/** One game's totals per mode over [from, to), clipped to the model's `now`. */
export function totals(model, slug, from, to) {
  const g = model.games.find((x) => x.slug === slug);
  const out = Object.fromEntries(g.modes.map((m) => [m.mode, ZERO()]));
  const end = Math.min(to, model.now);
  for (let d = 0; d < model.days[slug].length; d++) {
    const dayMs = model.firstDay + d * DAY_MS;
    if (dayMs + DAY_MS <= from || dayMs >= end) continue;
    const whole = from <= dayMs && dayMs + DAY_MS <= end;
    if (whole && dayMs + DAY_MS <= model.now) { for (const m of g.modes) add(out[m.mode], model.days[slug][d][m.mode]); continue; }
    if (dayMs < model.slotFrom) {
      // An older day only partly in range: prorate it (ranges are day-aligned in practice).
      const share = (Math.min(end, dayMs + DAY_MS) - Math.max(from, dayMs)) / DAY_MS;
      for (const m of g.modes) for (const f of ['count', 'turnover', 'profit', 'expected']) out[m.mode][f] += model.days[slug][d][m.mode][f] * share;
      continue;
    }
    const base = (dayMs - model.slotFrom) / SLOT_MS;
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const at = dayMs + s * SLOT_MS;
      // A slot counts once it has ended - the poll at its end reports it.
      if (at < from || at + SLOT_MS > end) continue;
      for (const m of g.modes) add(out[m.mode], model.slots[slug][base + s][m.mode]);
    }
  }
  return out;
}

/** Distinct players over a range: each day's players, less the overlap of returning ones. */
function uniquePlayers(model, g, from, to) {
  const t = Object.values(totals(model, g.slug, from, to)).reduce((a, c) => a + c.count, 0);
  const daysSpanned = Math.max(1, (Math.min(to, model.now) - from) / DAY_MS);
  return Math.round((t / g.betsPerPlayerDay) * daysSpanned ** -0.45);
}

function online(model, g) {
  const slot = Math.floor((model.now - model.slotFrom) / SLOT_MS) - 1;
  const cell = model.slots[g.slug][slot];
  if (!cell) return 0;
  const bets = Object.values(cell).reduce((a, c) => a + c.count, 0);
  return Math.max(0, Math.round((bets / 6) * (0.85 + 0.3 * ((g.index * 7919 + slot) % 97) / 97)));
}

const sum = (t) => Object.values(t).reduce((a, c) => { add(a, c); return a; }, ZERO());
const units = (usd) => Math.round(usd * UNITS);
const statsOf = (t) => ({ count: Math.round(t.count), turnover: units(t.turnover), profit: units(t.profit), expectedProfit: units(t.expected) });

function parseEdge(value, end) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value > 1e11 ? value : value * 1000;
  const s = String(value);
  // A bare date means its whole UTC day: an end date runs through its midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00Z`) + (end ? DAY_MS : 0);
  return Date.parse(s);
}

/** The five calls src/api/client.mjs makes, answered from the model as of `model.now`. */
export function api(model) {
  const ok = (data, endpoint) => Promise.resolve({ ok: true, status: 200, data, endpoint, error: null });
  const live = model.games;
  return {
    teamStats(range) {
      const from = parseEdge(range?.start, false) ?? monthStart(model.now);
      const to = parseEdge(range?.end, true) ?? model.now;
      return ok(live.map((g) => ({ name: g.name, slug: g.slug, image: g.image,
        stats: { ...statsOf(sum(totals(model, g.slug, from, to))), unique: uniquePlayers(model, g, from, to), rate: 1000 } })), `/teams/${DEMO_TEAM}/stats`);
    },
    teamGames() {
      const ms = monthStart(model.now), today = dayStart(model.now);
      const shape = (t) => { const s = statsOf(t); return { count: s.count, turnover: s.turnover, profit: s.profit, expected: 0 }; };
      return ok([
        ...live.map((g) => ({ name: g.name, slug: g.slug, rating: g.rating, published: true, isLive: true, approval: { column: 'responded' },
          stats: { month: shape(sum(totals(model, g.slug, ms, model.now))), day: shape(sum(totals(model, g.slug, today, model.now))) },
          onlinePlayers: online(model, g) })),
        ...model.unreleased.map((name) => ({ name, slug: slugOf(name), rating: 30, published: false, isLive: false, approval: { column: 'new' }, stats: null, onlinePlayers: 0 })),
      ], `/teams/${DEMO_TEAM}/games`);
    },
    gameStats(slug) {
      const g = live.find((x) => x.slug === slug);
      if (!g) return Promise.resolve({ ok: false, status: 404, data: null, endpoint: slug, error: { code: 'NOT_FOUND', message: 'no such game' } });
      const t = totals(model, slug, monthStart(model.now), model.now);
      const stats = g.modes.map((m) => {
        const c = t[m.mode];
        const s = statsOf(c);
        return { mode: m.mode, count: s.count, turnover: s.turnover, profit: s.profit, expectedReturn: s.expectedProfit,
          effectiveRtp: c.turnover > 0 ? 1 - c.profit / c.turnover : null, normalizedRtp: g.rtp, rtp: g.rtp, cost: m.cost,
          avgBet: s.count > 0 ? Math.round(s.turnover / s.count) : 0 };
      });
      return ok({ name: g.name, slug: g.slug, image: g.image, stats, betStats: [] }, `/teams/${DEMO_TEAM}/games/${slug}/stats`);
    },
    balance() {
      const month = live.reduce((a, g) => { add(a, sum(totals(model, g.slug, monthStart(model.now), model.now))); return a; }, ZERO());
      const carry = -1_250_000 * UNITS;
      return ok({ position: carry + units(month.profit * 0.1), expectedProfit: carry + units(month.expected * 0.1), carry }, `/teams/${DEMO_TEAM}/balance`);
    },
    graph() {
      const days = [];
      for (let d = model.firstDay; d <= dayStart(model.now); d += DAY_MS) days.push(d);
      const per = days.map((d) => live.reduce((a, g) => { add(a, sum(totals(model, g.slug, d, d + DAY_MS))); return a; }, ZERO()));
      return ok({ profit: per.map((p) => units(p.profit)), turnover: per.map((p) => units(p.turnover)), count: per.map((p) => Math.round(p.count)) }, `/teams/${DEMO_TEAM}/graph`);
    },
  };
}

export const DEMO = { DAY_MS, SLOT_MS, SLOT_DAYS, HISTORY_DAYS, UNITS, monthStart, dayStart };
