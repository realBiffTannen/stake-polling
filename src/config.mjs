import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_MONEY } from './money.mjs';
import { parseSize, DEFAULT_REDIS_LIMIT } from './store/memory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEAM_RE = /^[a-z0-9][a-z0-9-]*$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MINUTES_PER_DAY = 1440;

/**
 * Load config.json, overlay config.local.json, and apply environment overrides.
 *
 * config.json ships with the code and names no studio: it holds the tuning
 * every install shares. config.local.json (gitignored; start from
 * config.local.example.json) holds what belongs to ONE install - the team
 * slug, the day its lifetime figures count from, the launchd label - and is
 * merged over it section by section, so overriding `detect.zWarn` keeps the
 * rest of `detect`. Environment variables beat both. Pass `local: null` to
 * skip config.local.json (the tests do, so they pass on a fresh clone).
 *
 * Everything time-based in config.json is written in WALL-CLOCK MINUTES, and
 * everything the code consumes is derived from it here. That split exists
 * because the poll interval is a dial: when it moved from one minute to five,
 * a per-tick "interval: 5" silently meant twenty-five minutes, a "floor of 50
 * per tick" silently became five times less sensitive, and a trail capped at
 * "43200 samples" silently became 150 days instead of 30. Deriving all three
 * from `pollMinutes` keeps a change to the dial from quietly changing
 * everything else.
 *
 * The sid is deliberately not part of the returned object - it is resolved
 * separately by src/sid so it can never be logged along with the config.
 *
 * @param {{ env?: NodeJS.ProcessEnv, root?: string, local?: string | null }} [opts]
 */
export function loadConfig(opts = {}) {
  const root = opts.root ?? ROOT;
  // .env at the root (gitignored; start from .env.example) holds this
  // install's secrets and switches - REDIS_PASSWORD, S3_BUCKET, AWS_*. Only
  // for a real run: a test passes its own env. A variable already set in the
  // real environment wins over the file.
  if (opts.env === undefined) {
    const dotEnv = join(root, '.env');
    if (existsSync(dotEnv)) process.loadEnvFile(dotEnv);
  }
  const env = opts.env ?? process.env;
  const localPath = opts.local === undefined ? join(root, 'config.local.json') : opts.local;
  const file = merge(readJson(join(root, 'config.json')), localPath && existsSync(localPath) ? readJson(localPath) : {});

  const pollMinutes = positive(env.STAKE_POLL_MINUTES, file.pollMinutes ?? 1);
  const money = { ...DEFAULT_MONEY, ...file.money };

  const cfg = {
    ...file,
    root,
    pollMinutes,
    pollMs: pollMinutes * 60000,
    // "TURN/5m" rather than "TURN/m" - a rate column has to say what the
    // period is, or it reads as a per-minute figure five times too large.
    rateLabel: pollMinutes === 1 ? '/m' : `/${pollMinutes}m`,
    rateWords: pollMinutes === 1 ? 'per minute' : `per ${pollMinutes} minutes`,
    team: env.STAKE_TEAM ?? file.team,
    lifetimeStart: env.STAKE_LIFETIME_START ?? file.lifetimeStart,
    apiUrl: stripSlash(env.STAKE_API_URL ?? file.apiUrl),
    redisUrl: env.REDIS_URL ?? file.redisUrl,
    // Past this, every screen carries a sticky alert (src/store/memory.mjs).
    redisMemoryLimit: env.REDIS_DB_SIZE ?? file.redisDbSize ?? DEFAULT_REDIS_LIMIT,
    sidFile: env.STAKE_SID_FILE ?? join(root, file.sidFile),
    timeoutMs: positive(env.STAKE_TIMEOUT_MS, file.timeoutMs),
    dayBoundaryUtcHour: file.dayBoundaryUtcHour ?? 12,
    money,
  };

  // Endpoint cadences are configured in minutes; the scheduler counts ticks.
  cfg.intervals = {};
  for (const [name, minutes] of Object.entries(file.intervals ?? {})) {
    cfg.intervals[name] = Math.max(1, Math.round(minutes / pollMinutes));
  }
  cfg.intervalMinutes = { ...file.intervals };

  cfg.retention = {
    ...file.retention,
    trailMaxLen: file.retention?.trailMaxLen ?? Math.ceil(((file.retention?.trailDays ?? 30) * MINUTES_PER_DAY) / pollMinutes),
  };

  cfg.detect = buildDetect(file.detect ?? {}, pollMinutes, money);

  // The nightly archive (src/archive): to S3 when S3_BUCKET is set, else to a
  // local directory. The AWS SDK finds its own credentials and region
  // (AWS_PROFILE, AWS_ACCESS_KEY_ID, ~/.aws, ...), so none are held here.
  cfg.archive = {
    bucket: env.S3_BUCKET || null,
    prefix: String(env.S3_PREFIX ?? 'stake-polling').replace(/^\/+|\/+$/g, ''),
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || null,
    localDir: env.STAKE_ARCHIVE_DIR || join(root, 'stake-polling-logrotate-data'),
    presignSeconds: Math.round(positive(env.S3_PRESIGN_SECONDS, 3600)),
    catchUpDays: 7,
  };

  if (cfg.team === undefined || cfg.team === '') {
    throw new Error('no team configured: copy config.local.example.json to config.local.json and set "team" to your studio\'s slug '
      + '(the <slug> in studio.engine.io/teams/<slug>), or set STAKE_TEAM');
  }
  if (!TEAM_RE.test(cfg.team)) {
    throw new Error(`invalid team slug: ${JSON.stringify(cfg.team)}`);
  }
  // Lifetime figures are summed from this day, and the daily-insights cache is
  // keyed on it, so it has to be a real date rather than whatever parses.
  if (!DATE_RE.test(String(cfg.lifetimeStart ?? '')) || Number.isNaN(Date.parse(`${cfg.lifetimeStart}T00:00:00Z`))) {
    throw new Error(`invalid lifetimeStart: ${JSON.stringify(cfg.lifetimeStart)} - set it in config.local.json (or STAKE_LIFETIME_START) `
      + 'to the YYYY-MM-DD your studio\'s first game went live');
  }
  cfg.redisMemoryLimitBytes = parseSize(cfg.redisMemoryLimit);
  if (cfg.redisMemoryLimitBytes === null) {
    throw new Error(`invalid REDIS_DB_SIZE: ${JSON.stringify(cfg.redisMemoryLimit)} - use a size like 2GB or 512MB, or a byte count`);
  }
  if (cfg.archive.bucket !== null && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.archive.bucket)) {
    throw new Error(`invalid S3_BUCKET: ${JSON.stringify(cfg.archive.bucket)} - 3 to 63 lowercase letters, digits, dots and hyphens`);
  }
  // SigV4 caps a presigned URL at seven days.
  if (cfg.archive.presignSeconds > 604800) {
    throw new Error(`invalid S3_PRESIGN_SECONDS: ${cfg.archive.presignSeconds} - a presigned URL lasts at most 604800 seconds (7 days)`);
  }
  if (!/^https?:\/\//.test(cfg.apiUrl)) {
    throw new Error(`invalid apiUrl: ${cfg.apiUrl}`);
  }
  // A baseline window no longer than the warm-up means no metric can ever
  // reach the sample count it needs, and the detector goes permanently silent
  // without saying so.
  if (cfg.detect.window <= cfg.detect.warmupSamples) {
    throw new Error(`detect.windowSamples (${cfg.detect.window}) must exceed detect.warmupSamples (${cfg.detect.warmupSamples}) or nothing can ever alert`);
  }
  return cfg;
}

function buildDetect(detect, pollMinutes, money) {
  const out = {
    ...detect,
    money,
    window: detect.windowSamples ?? 36,
    warmupSamples: detect.warmupSamples ?? 12,
    // A tail measured in samples, but never fewer than two - one sample is a
    // reading, not a flat line.
    flatLineSamples: Math.max(2, Math.round((detect.flatLineMinutes ?? 15) / pollMinutes)),
    flatLineMinutes: detect.flatLineMinutes ?? 15,
    windowMinutes: (detect.windowSamples ?? 36) * pollMinutes,
    pollMinutes,
    rateLabel: pollMinutes === 1 ? '/min' : `/${pollMinutes}min`,
  };

  // Rate floors are configured per minute. A five-minute tick accumulates five
  // minutes of volume, so the floor has to scale with it or the same
  // configured sensitivity means something different at every interval.
  out.floors = {};
  for (const [metric, perMinute] of Object.entries(detect.ratePerMinuteFloors ?? {})) {
    out.floors[metric] = perMinute * pollMinutes;
  }
  // Level floors describe an instantaneous reading, not an accumulation, so
  // they do not scale: twenty-five players online is twenty-five players
  // however often it is measured.
  for (const [metric, level] of Object.entries(detect.levelFloors ?? {})) {
    out.floors[metric] = level;
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** `over` onto `base`, recursing into plain objects; arrays and scalars replace. */
function merge(base, over) {
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    out[key] = plain(value) && plain(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function stripSlash(url) {
  return String(url).replace(/\/+$/, '');
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
