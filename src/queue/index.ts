import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { WORKER_IDS, type WebhookJob, type WorkerId } from '../types/job.js';

/**
 * BullMQ requires `maxRetriesPerRequest: null` for blocking commands (Workers/Streams).
 * Keep `enableReadyCheck: false` for resilience against transient unavailability.
 */
export const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (err: Error) => {
  console.error('[redis] connection error', err.message);
});

const defaultJobOptions = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
  removeOnFail: false,
};

/**
 * Queue names use plain workerId (no `queue:` prefix) — BullMQ rejects `:`.
 * Bull Board / logs can still display "queue:sheets" as a presentation choice.
 */
export const QUEUE_NAMES: Record<WorkerId, string> = {
  sheets: 'sheets',
  chatwoot: 'chatwoot',
  mautic: 'mautic',
  meta: 'meta',
  sendflow: 'sendflow',
};

export const queues: Record<WorkerId, Queue<WebhookJob>> = {
  sheets: new Queue<WebhookJob>(QUEUE_NAMES.sheets, { connection, defaultJobOptions }),
  chatwoot: new Queue<WebhookJob>(QUEUE_NAMES.chatwoot, { connection, defaultJobOptions }),
  mautic: new Queue<WebhookJob>(QUEUE_NAMES.mautic, { connection, defaultJobOptions }),
  meta: new Queue<WebhookJob>(QUEUE_NAMES.meta, { connection, defaultJobOptions }),
  sendflow: new Queue<WebhookJob>(QUEUE_NAMES.sendflow, { connection, defaultJobOptions }),
};

/**
 * Atomic "next free slot" reservation for spacing group messages. Each call
 * reserves the next available instant for `key` and advances the pointer by
 * `spacingMs`, returning how long (ms) the caller must wait before its slot.
 *
 * First caller → 0 (send now). Simultaneous callers → 0, spacing, 2*spacing…
 * so a burst of purchases drips one message per `spacingMs` instead of all at
 * once. Atomic in Redis, so it's correct across worker concurrency/instances.
 */
const RESERVE_SLOT_LUA = `
local nxt = tonumber(redis.call('get', KEYS[1]) or '0')
local now = tonumber(ARGV[1])
local spacing = tonumber(ARGV[2])
local slot = now
if nxt > now then slot = nxt end
redis.call('set', KEYS[1], slot + spacing, 'PX', tonumber(ARGV[3]))
return slot - now
`;

export async function reserveSlot(key: string, spacingMs: number): Promise<number> {
  if (spacingMs <= 0) return 0;
  const now = Date.now();
  const ttl = spacingMs * 4 + 60_000; // key self-expires once the burst is quiet
  const res = await connection.eval(
    RESERVE_SLOT_LUA,
    1,
    key,
    String(now),
    String(spacingMs),
    String(ttl),
  );
  return Number(res);
}

export async function ping(): Promise<boolean> {
  try {
    const r = await connection.ping();
    return r === 'PONG';
  } catch {
    return false;
  }
}

export async function close(): Promise<void> {
  await Promise.all(WORKER_IDS.map((w) => queues[w].close()));
  await connection.quit();
}
