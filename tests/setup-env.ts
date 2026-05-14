/**
 * Inject minimum required env vars BEFORE src/config.ts validates.
 * Story 1.1 — `config.ts` exits the process if env is invalid; tests must
 * pre-populate so the import side-effect succeeds.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.ADMIN_PASSWORD ??= 'test-password';
process.env.LOG_LEVEL ??= 'error';
