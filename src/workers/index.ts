/**
 * Worker bootstrap entrypoint. Started as a separate process from the gateway
 * (Coolify: same image, different command — `node dist/workers/index.js`).
 *
 * Each worker is independent: failure of one does NOT take down the others.
 */
import { startSheetsWorker } from './sheets.worker.js';
import { startChatwootWorker } from './chatwoot.worker.js';
import { startMauticWorker } from './mautic.worker.js';
import { startMetaWorker } from './meta.worker.js';
import type { Worker } from 'bullmq';

async function startAll(): Promise<Worker[]> {
  // Start each worker independently — if one's config is missing, log and skip.
  const results = await Promise.allSettled([
    startSheetsWorker(),
    startChatwootWorker(),
    startMauticWorker(),
    startMetaWorker(),
  ]);

  const workers: Worker[] = [];
  const names = ['sheets', 'chatwoot', 'mautic', 'meta'];

  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      console.log(`[workers] ✓ ${names[i]} worker started`);
      workers.push(r.value);
    } else {
      console.error(`[workers] ✕ ${names[i]} worker failed to start: ${String(r.reason)}`);
    }
  }

  if (workers.length === 0) {
    throw new Error('No workers started — check env credentials');
  }

  return workers;
}

async function main(): Promise<void> {
  const workers = await startAll();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[workers] shutting down on ${signal}`);
    await Promise.allSettled(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

const isEntry = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isEntry) {
  void main().catch((err) => {
    console.error('[workers] fatal startup error', err);
    process.exit(1);
  });
}
