import 'dotenv/config';
import { z } from 'zod';

/**
 * Treat empty string env vars as undefined.
 * Docker Compose expands unset `${VAR:-}` to literal `""`.
 */
const optionalString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  ADMIN_USER: z.string().min(1).default('lucas'),
  ADMIN_PASSWORD: optionalString,
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 chars')
    .default('change-me-in-production-this-is-not-secure-default-32+chars'),
  CORS_ALLOWED_ORIGIN: optionalString,

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Chatwoot / Mautic / Meta credentials live in their respective `*_instances`
  // tables now. Configured via `/instances` UI. Each campaign FKs into one.

  // Sheets — stays as env because it's one global service account shared
  // across all campaign spreadsheets. The user shares each Sheet with this
  // account's email.
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = z.infer<typeof envSchema>;
