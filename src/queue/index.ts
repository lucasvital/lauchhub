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
};

export const queues: Record<WorkerId, Queue<WebhookJob>> = {
  sheets: new Queue<WebhookJob>(QUEUE_NAMES.sheets, { connection, defaultJobOptions }),
  chatwoot: new Queue<WebhookJob>(QUEUE_NAMES.chatwoot, { connection, defaultJobOptions }),
  mautic: new Queue<WebhookJob>(QUEUE_NAMES.mautic, { connection, defaultJobOptions }),
  meta: new Queue<WebhookJob>(QUEUE_NAMES.meta, { connection, defaultJobOptions }),
};

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
