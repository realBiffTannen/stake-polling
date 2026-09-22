/**
 * The Engine accounting API.
 *
 * Every method resolves - none of them throw. A poller that dies on a 500 at
 * 3am is worse than one that records the failure and tries again in sixty
 * seconds, so transport problems are values here, not exceptions.
 *
 * Endpoints (all authenticated with the sid cookie):
 *   /teams/{team}/stats                  roster, month-to-date, balance
 *   /teams/{team}/stats?start=&end=      the same roster over a window
 *   /teams/{team}/games                  onlinePlayers, month and day totals
 *   /teams/{team}/games/{game}/stats     per-mode breakdown for one game
 *   /teams/{team}/graph                  per-day buckets, 90 days back
 */
export class ApiClient {
  constructor({ apiUrl, team, sid, timeoutMs = 15000, retryDelayMs = 400 }) {
    this.apiUrl = String(apiUrl).replace(/\/+$/, '');
    this.team = team;
    this.timeoutMs = timeoutMs;
    this.retryDelayMs = retryDelayMs;
    this.#sid = sid;
  }

  #sid;

  /** Swap in a freshly resolved sid without disturbing anything in flight. */
  setSid(sid) {
    this.#sid = sid;
  }

  teamStats(range) {
    const query = range?.start || range?.end
      ? `?start=${epochSeconds(range.start)}&end=${epochSeconds(range.end)}`
      : '';
    return this.#get(`/teams/${this.team}/stats${query}`);
  }

  teamGames() {
    return this.#get(`/teams/${this.team}/games`);
  }

  /** @param {string} slug the game's slug - the display name 404s. */
  gameStats(slug) {
    return this.#get(`/teams/${this.team}/games/${encodeURIComponent(slug)}/stats`);
  }

  balance() {
    return this.#get(`/teams/${this.team}/balance`);
  }

  graph() {
    return this.#get(`/teams/${this.team}/graph`);
  }

  async #get(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.#once(path);
      if (result.ok) return result;
      last = result;
      // An expired sid will be expired again in 400ms. A parse failure means
      // the server answered with something that is not the API at all.
      if (result.error.code === 'AUTH' || result.error.code === 'PARSE' || result.error.code === 'CLIENT') return result;
      if (attempt === 0) await sleep(this.retryDelayMs + Math.random() * this.retryDelayMs);
    }
    return last;
  }

  async #once(path) {
    const url = `${this.apiUrl}${path}`;
    let res;
    try {
      res = await fetch(url, {
        headers: { cookie: `sid=${this.#sid}`, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return fail(0, 'NETWORK', `${path}: ${err?.name === 'TimeoutError' ? 'timed out' : err?.code ?? err?.name ?? 'request failed'}`, path);
    }

    if (res.status === 401 || res.status === 403) {
      return fail(res.status, 'AUTH', `${path}: ${res.status} - the sid is expired or not valid for this team`, path);
    }

    let body;
    try {
      body = await res.json();
    } catch {
      return fail(res.status, res.ok ? 'PARSE' : 'SERVER', `${path}: ${res.status} with a non-JSON body`, path);
    }

    if (!res.ok) {
      const code = res.status >= 500 ? 'SERVER' : 'CLIENT';
      // The upstream body is echoed back to us and could contain anything -
      // including the credential we just sent. Never carry it into the result.
      return fail(res.status, code, `${path}: ${res.status}`, path);
    }

    return { ok: true, status: res.status, data: body, endpoint: path, error: null };
  }
}

/**
 * The windowed roster query takes epoch SECONDS. ISO dates answer 400 and
 * epoch milliseconds answer 500, so this is not a detail to leave to the
 * caller.
 *
 * @param {string|number|Date} value a date string, epoch ms, or Date
 */
function epochSeconds(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);

  const n = Number(value);
  if (Number.isFinite(n)) {
    // Anything this large is already milliseconds; anything smaller is seconds.
    return Math.floor(n > 1e11 ? n / 1000 : n);
  }

  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00.000Z` : String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : '';
}

function fail(status, code, message, endpoint) {
  return { ok: false, status, data: null, endpoint, error: { code, message } };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
