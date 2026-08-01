import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchByPhone } from '../../src/integrations/chatwoot/client.js';

const cfg = { baseUrl: 'https://chat.test', accountId: '1', token: 'tok' };

function mockFetchPayload(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ payload }),
  }) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('searchByPhone — exact normalized match', () => {
  it('picks the contact with the exact number, not a superstring match', async () => {
    // Chatwoot fuzzy-matches "5535991891712" against both the real contact and
    // a typo'd "25535991891712" (Tanzania +255). Must return the real one.
    mockFetchPayload([
      { id: 1, phone_number: '+25535991891712' }, // wrong (superstring)
      { id: 2, phone_number: '+5535991891712' }, // correct
    ]);
    const c = await searchByPhone(cfg, '5535991891712');
    expect(c?.id).toBe(2);
  });

  it('returns null when only a wrong (superstring) number is found', async () => {
    mockFetchPayload([{ id: 1, phone_number: '+25535991891712' }]);
    const c = await searchByPhone(cfg, '5535991891712');
    expect(c).toBeNull();
  });

  it('matches regardless of how the stored number is formatted', async () => {
    mockFetchPayload([{ id: 3, phone_number: '55 35 99189-1712' }]);
    const c = await searchByPhone(cfg, '5535991891712');
    expect(c?.id).toBe(3);
  });
});
