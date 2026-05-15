import pino from 'pino';
import { config } from '../config.js';

/**
 * Shared structured logger for worker processes.
 *
 * Output is JSON in production (consumed by Docker / Coolify log viewer) and
 * pretty-printed in development.
 *
 * Use child loggers in workers: `logger.child({ worker: 'mautic' })` so every
 * line is tagged automatically.
 *
 * NEVER log credentials: passwords, tokens, API keys, service-account JSON.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
