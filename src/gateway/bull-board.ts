import type { FastifyInstance } from 'fastify';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
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
  createBullBoard({
    queues: workerIds.map((id) => new BullMQAdapter(queues[id])),
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: '/queue',
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
