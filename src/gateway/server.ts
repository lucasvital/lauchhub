import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config.js';
import { ping as pingDb, close as closeDb } from '../db/index.js';
import { ping as pingRedis, close as closeQueue } from '../queue/index.js';
import { registerWebhookRoute } from './routes/webhook.js';
import { registerAuth } from './auth.js';
import { registerCampaignsRoutes } from './routes/campaigns.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerBullBoard } from './bull-board.js';
import { registerLogsRoutes } from './routes/logs.js';
import { registerInstancesRoutes } from './routes/instances.js';

const APP_VERSION = '0.1.0';
const startedAt = Date.now();

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      // Escape hatch for MVP / dev with weird hosts (sslip.io, IPs, etc).
      // Set CORS_ALLOWED_ORIGIN=* to allow any origin.
      const allowedRaw = process.env.CORS_ALLOWED_ORIGIN ?? '';
      if (allowedRaw.trim() === '*') return cb(null, true);
      const allowed = allowedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isLocalhost = /^https?:\/\/localhost:\d+$/.test(origin);
      let hostname = '';
      try {
        hostname = new URL(origin).hostname;
      } catch {
        return cb(new Error('CORS: invalid origin'), false);
      }
      const isVercelPreview = /\.vercel\.app$/.test(hostname);
      const isSslipIo = /\.sslip\.io$/.test(hostname);
      if (isLocalhost || isVercelPreview || isSslipIo || allowed.includes(origin))
        return cb(null, true);
      cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
  });

  await registerAuth(app);
  await registerWebhookRoute(app);
  await registerCampaignsRoutes(app);
  await registerDashboardRoutes(app);
  await registerSettingsRoutes(app);
  await registerLogsRoutes(app);
  await registerInstancesRoutes(app);
  // Bull Board needs real BullMQ Queue instances. Skip in tests (queues are mocked).
  if (config.NODE_ENV !== 'test') {
    await registerBullBoard(app);
  }

  app.get('/health', async (_req, reply) => {
    const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
    const ok = db && redis;
    return reply.code(ok ? 200 : 503).send({
      ok,
      version: APP_VERSION,
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      checks: { db, redis },
    });
  });

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closeDb();
      await closeQueue();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

const isEntry = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isEntry) {
  void main();
}
