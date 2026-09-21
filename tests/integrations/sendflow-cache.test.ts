import { describe, it, expect, vi } from 'vitest';
import { cooldownMsFor, singleFlight } from '../../src/integrations/sendflow/cache.js';

describe('cooldownMsFor', () => {
  it('honors "Tempo restante: N min" from a hard block (+1 min buffer)', () => {
    expect(cooldownMsFor('Chave temporariamente bloqueada. Tempo restante: 1439 min 6s')).toBe(
      1439 * 60_000 + 60_000,
    );
  });

  it('caps the parsed block at 24h', () => {
    expect(cooldownMsFor('tempo restante: 100000 min')).toBe(24 * 60 * 60_000);
  });

  it('falls back to 6h for a block without a parseable time', () => {
    expect(cooldownMsFor('Chave temporariamente bloqueada por excesso de requisições')).toBe(
      6 * 60 * 60_000,
    );
  });

  it('uses a short 5 min backoff for a plain rate limit', () => {
    expect(cooldownMsFor('Limite de operações atingido!')).toBe(5 * 60_000);
  });
});

describe('singleFlight', () => {
  it('coalesces concurrent calls with the same key into one execution', async () => {
    const fn = vi.fn().mockResolvedValue('x');
    const [a, b] = await Promise.all([
      singleFlight('k', fn),
      singleFlight('k', fn),
    ]);
    expect(a).toBe('x');
    expect(b).toBe('x');
    expect(fn).toHaveBeenCalledTimes(1); // only one upstream call for the pair
  });

  it('runs again once the previous flight settled', async () => {
    const fn = vi.fn().mockResolvedValue('y');
    await singleFlight('k2', fn);
    await singleFlight('k2', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
