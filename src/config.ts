import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  ADMIN_USER: z.string().min(1).default('lucas'),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 chars')
    .default('change-me-in-production-this-is-not-secure-default-32+chars'),
  CORS_ALLOWED_ORIGIN: z.string().optional(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  CHATWOOT_URL: z.string().url().optional(),
  CHATWOOT_TOKEN: z.string().optional(),
  CHATWOOT_ACCOUNT_ID: z.string().optional(),

  MAUTIC_URL: z.string().url().optional(),
  MAUTIC_CLIENT_ID: z.string().optional(),
  MAUTIC_CLIENT_SECRET: z.string().optional(),

  META_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_API_VERSION: z.string().default('v20.0'),

  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = z.infer<typeof envSchema>;
