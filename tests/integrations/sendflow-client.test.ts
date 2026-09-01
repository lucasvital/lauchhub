import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  removeParticipants,
  sendTextMessage,
  listReleases,
  listGroups,
} from '../../src/integrations/sendflow/client.js';
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

describe('sendTextMessage', () => {
  it('POSTs to /send-text-message/{accountId} with phone + text', async () => {
    const fn = mockFetch(200, '{"success":true,"state":"sent"}');
    await sendTextMessage({ accountId: 'acc-9', phoneNumber: '5535991891712', text: 'oi João' });

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://sendapi.sendflow.pro/send-text-message/acc-9');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      phoneNumber: '5535991891712',
      text: 'oi João',
    });
  });

  it('throws when a 200 reports success:false', async () => {
    mockFetch(200, '{"success":false}');
    await expect(
      sendTextMessage({ accountId: 'a', phoneNumber: '1', text: 't' }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it('treats 409 account-not-connected as fatal', async () => {
    mockFetch(409, 'account-not-connected');
    await expect(
      sendTextMessage({ accountId: 'a', phoneNumber: '1', text: 't' }),
    ).rejects.toBeInstanceOf(FatalError);
  });

  it('treats a rate-limit 403 as transient', async () => {
    mockFetch(403, 'Limite de operações atingido!');
    await expect(
      sendTextMessage({ accountId: 'a', phoneNumber: '1', text: 't' }),
    ).rejects.toBeInstanceOf(TransientError);
  });
});

function mockJsonFetch(status: number, json: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(json),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('listReleases', () => {
  afterEach(() => vi.useRealTimers());

  it('maps and drops archived releases, then serves from cache within TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const fn = mockJsonFetch(200, [
      { id: 'r1', name: 'Campanha A', accountIds: ['acc-1'] },
      { id: 'r2', name: 'Arquivada', archived: true },
    ]);

    const first = await listReleases();
    expect(first.items).toEqual([{ id: 'r1', name: 'Campanha A', accountIds: ['acc-1'] }]);
    expect(first.stale).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second call within TTL: no new fetch, same data.
    const second = await listReleases();
    expect(second.items).toEqual([{ id: 'r1', name: 'Campanha A', accountIds: ['acc-1'] }]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache when a refresh hits the rate limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T01:00:00Z'));
    mockJsonFetch(200, [{ id: 'rr', name: 'Fresh', accountIds: [] }]);
    await listReleases();

    // Advance past the 5-min TTL, next fetch 403s → stale cache returned.
    vi.setSystemTime(new Date('2026-09-01T01:10:00Z'));
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'Limite de operações atingido!' });
    global.fetch = fn as unknown as typeof fetch;

    const res = await listReleases();
    expect(res.stale).toBe(true);
    expect(res.items).toEqual([{ id: 'rr', name: 'Fresh', accountIds: [] }]);
  });
});

describe('listGroups', () => {
  it('flattens the nested [[...]] response and keeps id/name/count/full', async () => {
    mockJsonFetch(200, [
      [
        { id: 'g1', name: 'Grupo 1', participantsAmount: 42, full: false },
        { id: 'g2', name: 'Grupo 2', participantsAmount: 256, full: true },
      ],
    ]);
    const res = await listGroups('rel-flatten-unique');
    expect(res.items).toEqual([
      { id: 'g1', name: 'Grupo 1', participantsAmount: 42, full: false },
      { id: 'g2', name: 'Grupo 2', participantsAmount: 256, full: true },
    ]);
  });

  it('returns an empty list (not an error) on 404', async () => {
    mockJsonFetch(404, { message: 'Release not found' });
    const res = await listGroups('rel-404-unique');
    expect(res.items).toEqual([]);
    expect(res.stale).toBe(false);
  });
});
