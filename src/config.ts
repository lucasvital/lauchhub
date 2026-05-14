import 'dotenv/config';
import { z } from 'zod';

/**
 * Treat empty string as undefined.
 * Docker Compose passes unset `${VAR:-}` interpolations as `""`, which would
 * otherwise fail a `.url()` validation. This lets optional fields stay empty.
 */
const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional(),
);

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

  CHATWOOT_URL: optionalUrl,
  CHATWOOT_TOKEN: optionalString,
  CHATWOOT_ACCOUNT_ID: optionalString,

  MAUTIC_URL: optionalUrl,
  MAUTIC_CLIENT_ID: optionalString,
  MAUTIC_CLIENT_SECRET: optionalString,

  META_TOKEN: optionalString,
  META_PHONE_NUMBER_ID: optionalString,
  META_API_VERSION: z.string().default('v20.0'),

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
