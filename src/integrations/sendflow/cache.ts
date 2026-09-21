/**
 * Persistent cache + rate-limit circuit breaker for SendFlow's listing
 * endpoints, backed by the shared Redis (BullMQ) connection.
 *
 * Why: SendFlow's list endpoints (releases/groups/templates) are heavily
 * rate-limited and the key gets BLOCKED for 24h after repeated violations. An
 * in-memory-only cache is wiped on every deploy, so a burst of deploys +
 * panel opens can hammer the API into a block. Persisting the cache in Redis
 * makes it survive deploys, and the cooldown flag stops all upstream calls
 * once the API signals a rate limit/block — we serve stale cache instead.
 *
 * Everything here is FAIL-OPEN: any Redis error is swallowed so a Redis blip
 * never breaks the panel (it just falls back to a live fetch / in-memory).
 */

import type { Redis } from 'ioredis';

const PREFIX = 'sendflow:cache:';
const COOLDOWN_KEY = 'sendflow:cooldown_until';
const CACHE_PX = 2 * 24 * 60 * 60_000; // keep stale copies for 2 days
const REDIS_TIMEOUT_MS = 800; // fail open fast if Redis is slow/unreachable

async function redis(): Promise<Redis> {
  const { connection } = await import('../../queue/index.js');
  return connection;
}

/** Resolve `fallback` if `p` hasn't settled within `ms` (fail-open guard). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(fallback), ms);
    p.then(done, () => done(fallback));
  });
}

/** Run a Redis op with a timeout + swallow errors (never throws / hangs). */
async function op<T>(run: (r: Redis) => Promise<T>, fallback: T): Promise<T> {
  try {
    const r = await withTimeout<Redis | null>(redis(), REDIS_TIMEOUT_MS, null);
    if (!r) return fallback;
    return await withTimeout(run(r), REDIS_TIMEOUT_MS, fallback);
  } catch {
    return fallback;
  }
}

export interface CachedEntry<T> {
  at: number;
  items: T[];
}

export async function cacheGet<T>(key: string): Promise<CachedEntry<T> | null> {
  const raw = await op((r) => r.get(PREFIX + key), null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedEntry<T>;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, at: number, items: T[]): Promise<void> {
  await op((r) => r.set(PREFIX + key, JSON.stringify({ at, items }), 'PX', CACHE_PX), null);
}

/** True while the key is in a rate-limit/block cooldown — do NOT call the API. */
export async function cooldownActive(): Promise<boolean> {
  const until = await op((r) => r.get(COOLDOWN_KEY), null);
  return until != null && Number(until) > Date.now();
}

/** Start (or extend) a cooldown for `ms`, so upstream calls are suppressed. */
export async function startCooldown(ms: number): Promise<void> {
  if (ms <= 0) return;
  const until = Date.now() + ms;
  await op((r) => r.set(COOLDOWN_KEY, String(until), 'PX', ms), null);
}

/**
 * How long to back off given the SendFlow error body. A hard block ("Chave
 * temporariamente bloqueada") includes "Tempo restante: N min" — honor it (so
 * we don't poke a blocked key for its whole 24h window). A plain rate limit
 * gets a short backoff.
 */
export function cooldownMsFor(bodyText: string): number {
  const b = bodyText.toLowerCase();
  const m = /tempo restante:\s*(\d+)\s*min/.exec(b);
  if (m) return Math.min(Number(m[1]) * 60_000 + 60_000, 24 * 60 * 60_000);
  if (b.includes('bloque')) return 6 * 60 * 60_000; // blocked, unknown duration → 6h
  return 5 * 60_000; // plain rate limit → 5 min
}

// ─── Single-flight: coalesce concurrent identical fetches ────────────────────
const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
