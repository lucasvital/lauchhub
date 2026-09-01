import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeParticipants } from '../../src/integrations/sendflow/client.js';
import { FatalError, TransientError } from '../../src/integrations/_shared/errors.js';

// The client reads the API key from global_config at runtime.
vi.mock('../../src/db/global-config.js', () => ({
  getRawValue: vi.fn(async () => 'sk-test'),
}));
import { getRawValue } from '../../src/db/global-config.js';

function mockFetch(status: number, body = ''): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => vi.restoreAllMocks());

describe('removeParticipants', () => {
  it('POSTs the SendFlow remove-participants payload with Bearer auth', async () => {
    const fn = mockFetch(200, '{"ok":true}');
    await removeParticipants({
      releaseId: 'rel-1',
      groupIds: ['g1', 'g2'],
      participants: ['5535991891712'],
    });

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://sendapi.sendflow.pro/actions/remove-participants');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      releaseId: 'rel-1',
      accountsFrom: 'release',
      to: { type: 'groups', ids: ['g1', 'g2'] },
      data: { participants: ['5535991891712'] },
    });
  });

  it('throws FatalError when the API key is missing', async () => {
    (getRawValue as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const fn = mockFetch(200);
    await expect(
      removeParticipants({ releaseId: 'r', groupIds: ['g'], participants: ['1'] }),
    ).rejects.toBeInstanceOf(FatalError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('treats a rate-limit 403 as transient (retryable)', async () => {
    mockFetch(403, 'Limite de operações atingido!');
    await expect(
      removeParticipants({ releaseId: 'r', groupIds: ['g'], participants: ['1'] }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it('treats a non-rate-limit 403 as fatal', async () => {
    mockFetch(403, 'Forbidden');
    await expect(
      removeParticipants({ releaseId: 'r', groupIds: ['g'], participants: ['1'] }),
    ).rejects.toBeInstanceOf(FatalError);
  });

  it('treats 5xx as transient', async () => {
    mockFetch(502, 'Bad Gateway');
    await expect(
      removeParticipants({ releaseId: 'r', groupIds: ['g'], participants: ['1'] }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it('treats a 400 as fatal', async () => {
    mockFetch(400, 'invalid release');
    await expect(
      removeParticipants({ releaseId: 'r', groupIds: ['g'], participants: ['1'] }),
    ).rejects.toBeInstanceOf(FatalError);
  });
});
