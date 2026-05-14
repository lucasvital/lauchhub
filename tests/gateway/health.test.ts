import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('../../src/db/index.js', () => ({
  ping: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/queue/index.js', () => ({
  ping: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  queues: {},
  connection: { ping: vi.fn() },
}));

const { ping: pingDb } = await import('../../src/db/index.js');
const { ping: pingRedis } = await import('../../src/queue/index.js');
const { buildServer } = await import('../../src/gateway/server.js');

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with ok=true when DB and Redis are reachable', async () => {
    vi.mocked(pingDb).mockResolvedValue(true);
    vi.mocked(pingRedis).mockResolvedValue(true);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({ db: true, redis: true });
    expect(body.version).toBeDefined();
    expect(typeof body.uptime_s).toBe('number');
  });

  it('returns 503 with ok=false when DB is down', async () => {
    vi.mocked(pingDb).mockResolvedValue(false);
    vi.mocked(pingRedis).mockResolvedValue(true);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    expect(res.json().checks.db).toBe(false);
  });

  it('returns 503 with ok=false when Redis is down', async () => {
    vi.mocked(pingDb).mockResolvedValue(true);
    vi.mocked(pingRedis).mockResolvedValue(false);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(res.json().checks.redis).toBe(false);
  });
});
