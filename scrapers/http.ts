// Polite HTTP for the scrapers: identifying User-Agent, per-host rate limiting,
// robots.txt honored, bounded retries. This is a six-person tool hitting each
// site a handful of times a day — it should behave like one.

// Must stay pure ASCII: HTTP header values are ByteStrings and a stray em dash
// throws before the request ever leaves.
const UA = 'LaborDayCabinFinder/1.0 (private trip planner for a small group of friends)';

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Per-host request queue. A plain "last request timestamp" check is not enough:
 * concurrent callers all read the same timestamp and fire simultaneously, which
 * is exactly the hammering the crawl delay exists to prevent. Chaining onto a
 * per-host promise serializes them and guarantees the spacing.
 */
const hostQueue = new Map<string, Promise<void>>();

function enqueue<T>(host: string, delayMs: number, task: () => Promise<T>): Promise<T> {
  const prior = hostQueue.get(host) ?? Promise.resolve();
  const run = prior.then(async () => {
    await sleep(delayMs);
    return task();
  });
  // Keep the chain alive even when a task rejects, or the host stalls forever.
  hostQueue.set(host, run.then(() => undefined, () => undefined));
  return run;
}

/** robots.txt rules per origin, fetched at most once per process. */
const robotsCache = new Map<string, Promise<RobotsRules>>();

type RobotsRules = {
  disallow: string[];
  crawlDelayMs: number | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRobots(origin: string): Promise<RobotsRules> {
  const empty: RobotsRules = { disallow: [], crawlDelayMs: null };
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;
    const text = await res.text();

    // Only the `User-agent: *` group applies to us; we don't claim a named agent.
    const rules: RobotsRules = { disallow: [], crawlDelayMs: null };
    let inStar = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (key === 'user-agent') {
        inStar = value === '*';
      } else if (inStar && key === 'disallow' && value) {
        rules.disallow.push(value);
      } else if (inStar && key === 'crawl-delay') {
        const secs = Number(value);
        if (Number.isFinite(secs)) rules.crawlDelayMs = secs * 1000;
      }
    }
    return rules;
  } catch {
    return empty;
  }
}

function robotsFor(origin: string): Promise<RobotsRules> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = fetchRobots(origin);
    robotsCache.set(origin, cached);
  }
  return cached;
}

export class BlockedByRobotsError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'BlockedByRobotsError';
  }
}

export type PoliteFetchOptions = {
  /** Floor for the delay between requests to the same host. */
  crawlDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Skip the robots check — only for first-party JSON APIs we were handed. */
  skipRobots?: boolean;
};

/**
 * One rate-limited, robots-respecting request. Retries on 429/5xx with backoff;
 * 4xx other than 429 fail immediately since retrying won't help.
 */
export async function politeFetch(
  url: string,
  init: RequestInit = {},
  opts: PoliteFetchOptions = {},
): Promise<Response> {
  const { origin, host } = new URL(url);
  const rules = opts.skipRobots ? null : await robotsFor(origin);

  if (rules) {
    const path = new URL(url).pathname + new URL(url).search;
    if (rules.disallow.some((rule) => rule !== '/' && path.startsWith(rule))) {
      throw new BlockedByRobotsError(url);
    }
    if (rules.disallow.includes('/')) throw new BlockedByRobotsError(url);
  }

  const delay = Math.max(opts.crawlDelayMs ?? 0, rules?.crawlDelayMs ?? 0, 250);
  const retries = opts.retries ?? 2;
  let lastError: unknown;

  const attemptOnce = () =>
    fetch(url, {
      ...init,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Every attempt goes through the host queue, so retries are spaced too.
    const outcome = await enqueue(host, delay, async () => {
      try {
        const res = await attemptOnce();
        return { ok: true as const, res };
      } catch (e) {
        return { ok: false as const, error: e };
      }
    });

    if (!outcome.ok) {
      lastError = outcome.error;
    } else {
      const { res } = outcome;
      if (res.ok) return res;

      lastError = new Error(`HTTP ${res.status} from ${url}`);
      // 4xx other than 429 won't succeed on retry — fail fast.
      if (res.status !== 429 && res.status < 500) throw lastError;

      const retryAfter = Number(res.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0 && attempt < retries) {
        await sleep(Math.min(retryAfter * 1000, 15_000));
        continue;
      }
    }

    if (attempt < retries) {
      await sleep(Math.min(delay * 2 ** (attempt + 1), 15_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

export function makeFetchers(opts: PoliteFetchOptions) {
  return {
    fetchText: async (url: string, init?: RequestInit) =>
      (await politeFetch(url, init, opts)).text(),
    fetchJson: async <T = any>(url: string, init?: RequestInit): Promise<T> => {
      const res = await politeFetch(
        url,
        { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } },
        opts,
      );
      return (await res.json()) as T;
    },
  };
}
