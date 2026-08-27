import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendTemplateMessage } from '../../src/integrations/chatwoot/client.js';

const cfg = { baseUrl: 'https://chat.test', accountId: '1', token: 'tok' };

function mockFetch(responseBody: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(responseBody),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function sentBody(fn: ReturnType<typeof vi.fn>): { template_params: { processed_params: unknown } } {
  return JSON.parse((fn.mock.calls[0][1] as { body: string }).body);
}

afterEach(() => vi.restoreAllMocks());

describe('sendTemplateMessage — modern nested processed_params (Chatwoot >= 4.x)', () => {
  it('wraps body params under { body } when there is no button', async () => {
    const fn = mockFetch({ id: 1 });
    await sendTemplateMessage(cfg, 99, {
      template_name: 't',
      language: 'pt_BR',
      processed_params: { '1': 'João' },
      rendered_content: 'oi',
    });
    expect(sentBody(fn).template_params.processed_params).toEqual({ body: { '1': 'João' } });
  });

  it('adds a buttons array with the url parameter when button_url_param is set', async () => {
    const fn = mockFetch({ id: 2 });
    await sendTemplateMessage(cfg, 99, {
      template_name: 't',
      language: 'pt_BR',
      processed_params: { '1': 'João' },
      button_url_param: 'DsybU94?coupon=X',
      rendered_content: 'oi',
    });
    expect(sentBody(fn).template_params.processed_params).toEqual({
      body: { '1': 'João' },
      buttons: [{ type: 'url', parameter: 'DsybU94?coupon=X' }],
    });
  });
});
