import type { FastifyInstance } from 'fastify';
import { createBullBoard } from '@bull-board/api';
// v5 doesn't expose subpath via `exports` field — use deep import.
import { BullMQAdapter } from '@bull-board/api/dist/src/queueAdapters/bullMQ.js';
import { FastifyAdapter } from '@bull-board/fastify';
import { queues } from '../queue/index.js';
import type { WorkerId } from '../types/job.js';

/**
 * Mount Bull Board at /queue, protected by the same auth middleware as other
 * /api routes. Bull Board provides its own UI for inspecting/retrying jobs.
 */
export async function registerBullBoard(app: FastifyInstance): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/queue');

  const workerIds: WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapters = workerIds.map((id) => new BullMQAdapter(queues[id] as any) as any);
  createBullBoard({ queues: adapters, serverAdapter });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: '/queue',
    basePath: '/queue',
  });

  // Protect the dashboard by checking auth on every /queue request
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/queue')) {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ ok: false, error: 'unauthorized', message: 'Login required for /queue' });
      }
    }
  });
}
