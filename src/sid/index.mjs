import { createHash } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { readChromeSid } from './chrome-cookies.mjs';
import { promptForSid } from './prompt.mjs';

/**
 * Where a working sid comes from, in order of preference:
 *
 *   1. STAKE_SID in the environment
 *   2. the .sid file (mode 600, gitignored)
 *   3. the logged-in Chrome profile's cookie store
 *   4. the operator, typed at the terminal
 *
 * Every candidate is validated against the live API before it is accepted, so
 * a stale value in an earlier source falls through instead of wedging the
 * poller on a credential that no longer works.
 */
export async function resolveSid(opts) {
  const { env = process.env, file, allowChrome = true, allowPrompt = true } = opts;
  const validate = opts.validate ?? (async () => true);
  const chromeReader = opts.chromeReader ?? readChromeSid;
  const prompt = opts.prompt ?? promptForSid;
  const tried = [];

  const candidates = [
    { source: 'env', read: async () => clean(env.STAKE_SID) },
    { source: 'file', read: async () => readSidFile(file) },
  ];
  if (allowChrome) candidates.push({ source: 'chrome', read: async () => clean(await chromeReader({})) });

  for (const candidate of candidates) {
    let sid = null;
    try {
      sid = await candidate.read();
    } catch {
      sid = null;
    }
    if (!sid) { tried.push({ source: candidate.source, outcome: 'absent' }); continue; }
    if (!(await validate(sid))) { tried.push({ source: candidate.source, outcome: 'rejected' }); continue; }

    // A sid recovered from Chrome is worth keeping so the next start is quiet.
    if (candidate.source === 'chrome' && file) await saveSid(file, sid).catch(() => {});
    return { sid, source: candidate.source, tried };
  }

  if (allowPrompt) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const typed = clean(await prompt(attempt));
      if (!typed) break;
      if (await validate(typed)) {
        if (file) await saveSid(file, typed).catch(() => {});
        tried.push({ source: 'prompt', outcome: 'accepted' });
        return { sid: typed, source: 'prompt', tried };
      }
      tried.push({ source: 'prompt', outcome: 'rejected' });
    }
  }

  return { sid: null, source: null, tried };
}

/** First 8 hex of sha256. Enough to tell "the sid changed" from "same sid, still failing". */
export function fingerprint(sid) {
  return createHash('sha256').update(String(sid)).digest('hex').slice(0, 8);
}

export async function readSidFile(path) {
  if (!path) return null;
  try {
    return clean(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Written 600 - this is a live credential, not configuration. */
export async function saveSid(path, sid) {
  await writeFile(path, `${String(sid).trim()}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}
