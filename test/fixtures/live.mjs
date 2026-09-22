// Trimmed captures of the real studio.engine.io responses, taken 2026-09-16.
// The first build guessed these shapes and every per-game request 404'd, so
// the shapes are now pinned by fixture rather than by assumption.

/** GET /teams/acme-studios/stats - an array, metrics nested under `stats`. */
export const roster = [
  {
    name: 'Neon City Heist',
    slug: 'neon-city-heist',
    image: '00000000-0000-7000-8000-000000000001',
    stats: { count: 44243, turnover: 70222880714, profit: -12375763487, expectedProfit: 2317355063, unique: 1512 },
  },
  {
    name: 'Pixel Carnivals',
    slug: 'pixel-carnivals',
    image: '00000000-0000-7000-8000-000000000002',
    stats: { count: 14822, turnover: 41446150864, profit: -22431353806, expectedProfit: 1367722978, unique: 538 },
  },
  {
    name: 'Pixel Nest',
    slug: 'pixel-nest',
    image: '00000000-0000-7000-8000-000000000003',
    stats: { count: 900, turnover: 1200000, profit: 40000, expectedProfit: 39000, unique: 42 },
  },
];

/** GET /teams/acme-studios/games - the whole catalogue; onlinePlayers is PER GAME. */
export const games = [
  {
    name: 'Berry', slug: 'berry', rating: 30, published: true, isLive: true,
    stats: {
      month: { count: 91431, turnover: 154846643418, profit: 1130616380, expected: 0 },
      day: { count: 246, turnover: 65962890, profit: -31992062, expected: 0 },
    },
    onlinePlayers: 4,
  },
  {
    name: 'Pixel Carnivals', slug: 'pixel-carnivals', rating: null, published: true, isLive: true,
    stats: {
      month: { count: 14822, turnover: 41446150864, profit: -22431353806, expected: 0 },
      day: { count: 100, turnover: 2000000, profit: -50000, expected: 0 },
    },
    onlinePlayers: 1,
  },
  // Unreleased titles appear here with no stats at all.
  { name: 'Hippo Hustle', slug: 'hippo-hustle', rating: 30, published: true, isLive: false, stats: null, onlinePlayers: 0 },
];

/** GET /teams/acme-studios/games/{slug}/stats - `stats` is the per-mode array, RTP is a FRACTION. */
export const gameStats = {
  name: 'Pixel Carnivals',
  slug: 'pixel-carnivals',
  image: '00000000-0000-7000-8000-000000000002',
  stats: [
    { mode: 'BASE', count: 10029, turnover: 5141917874, profit: -1575312730, expectedReturn: 169683335, effectiveRtp: 1.108850279261279, normalizedRtp: 0.8555664062500007, rtp: 0.9669999910816335, cost: 1, avgBet: 0.4 },
    { mode: 'BONUS_BOOST', count: 3538, turnover: 2425201818, profit: 405279906, expectedReturn: 80031681, effectiveRtp: 0.7032526838602313, normalizedRtp: 0.7586722685806535, rtp: 0.9669999909794619, cost: 3, avgBet: 0.2 },
    { mode: 'FREE_SPINS', count: 147, turnover: 3808690908, profit: 2322677099, expectedReturn: 125686806, effectiveRtp: 0.46540922430609144, normalizedRtp: 0.8307801418439716, rtp: 0.966999998403635, cost: 50, avgBet: 0.5 },
  ],
  betStats: [{ costUSD: 0, betCount: 20117, betTurnover: 760.88 }],
};

/** GET /teams/acme-studios/balance */
export const balance = { position: -4474893261, expectedProfit: -1026457000, carry: -2184064350 };

/** GET /teams/acme-studios/graph - parallel arrays, one entry per day. */
export const graph = {
  profit: [468620522, 931545230, 1079051904],
  turnover: [70222880714, 41446150864, 1200000],
  count: [44243, 14822, 900],
};

/**
 * GET /teams/acme-studios/games/metro-night-run/stats
 *
 * Five modes, two of them EXTREME, and a buy with a guaranteed 8.00x floor -
 * the widest mode set in the roster to render, and the case that catches a
 * table sized to three columns. RTP 95.50% in every mode; expectedReturn is
 * turnover x 0.045 exactly, which is what makes it a usable edge_api fixture.
 */
export const metroGameStats = {
  name: 'Metro Night Run',
  slug: 'metro-night-run',
  stats: [
    { mode: 'BASE',            count: 48210, turnover: 12_000_000_000, profit: -420_000_000, expectedReturn: 540_000_000, effectiveRtp: 1.0350, normalizedRtp: 0.9490, rtp: 0.9550, cost: 1,   avgBet: 0.25 },
    { mode: 'ANTE',            count: 6104,  turnover: 4_560_000_000,  profit: 205_200_000,  expectedReturn: 205_200_000, effectiveRtp: 0.8900, normalizedRtp: 0.9512, rtp: 0.9550, cost: 3,   avgBet: 0.25 },
    { mode: 'VIPER_VAULT',     count: 812,   turnover: 1_522_500_000,  profit: 68_512_500,   expectedReturn: 68_512_500,  effectiveRtp: 0.9550, normalizedRtp: 0.9550, rtp: 0.9550, cost: 75,  avgBet: 0.25 },
    { mode: 'COASTAL_CRUISER', count: 240,   turnover: 600_000_000,    profit: 27_000_000,   expectedReturn: 27_000_000,  effectiveRtp: 0.9550, normalizedRtp: 0.9550, rtp: 0.9550, cost: 100, avgBet: 0.25 },
    { mode: 'ICY_SPINOUT',     count: 96,    turnover: 360_000_000,    profit: 16_200_000,   expectedReturn: 16_200_000,  effectiveRtp: 0.9550, normalizedRtp: 0.9550, rtp: 0.9550, cost: 150, avgBet: 0.25 },
  ],
};
