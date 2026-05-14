import { FatalError, TransientError } from '../_shared/errors.js';

export interface MetaConfig {
  apiVersion: string; // e.g. 'v20.0'
  phoneNumberId: string;
  token: string;
}

export interface SendTemplateInput {
  to: string; // E.164 without `+`, e.g. '5541999999999'
  templateName: string;
  languageCode?: string; // default 'pt_BR'
  parameters?: string[]; // body parameters {{1}}, {{2}}, ...
}

interface MetaSuccessResponse {
  messaging_product: 'whatsapp';
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Meta error codes that are FATAL (never retry):
 *   100 — invalid parameter (template paused/rejected, bad number)
 *   131047 — re-engagement window (same template too soon)
 *   131048 — spam rate limit
 *   368 — temporarily blocked
 */
const FATAL_META_CODES = new Set([100, 131047, 131048, 368]);

export async function sendTemplate(
  cfg: MetaConfig,
  input: SendTemplateInput,
): Promise<{ messageId: string }> {
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? 'pt_BR' },
    },
  };

  if (input.parameters && input.parameters.length > 0) {
    (body.template as Record<string, unknown>).components = [
      {
        type: 'body',
        parameters: input.parameters.map((p) => ({ type: 'text', text: p })),
      },
    ];
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new TransientError(`Meta network error: ${String(err)}`, 'network');
  }

  if (res.status === 401 || res.status === 403) {
    throw new FatalError(`Meta auth ${res.status}`, `http_${res.status}`);
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new TransientError(
      'Meta rate-limited',
      'rate_limited',
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000,
    );
  }

  if (res.status >= 500) {
    throw new TransientError(`Meta ${res.status} upstream`, `http_${res.status}`);
  }

  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as MetaSuccessResponse & MetaErrorResponse;

  if (!res.ok) {
    const code = data.error?.code;
    if (code && FATAL_META_CODES.has(code)) {
      throw new FatalError(`Meta fatal error code=${code}: ${data.error?.message}`, `meta_${code}`);
    }
    throw new TransientError(`Meta ${res.status}: ${data.error?.message ?? 'unknown'}`, `meta_${code ?? 'unknown'}`);
  }

  const messageId = data.messages?.[0]?.id;
  if (!messageId) throw new FatalError('Meta returned no message id', 'bad_response');
  return { messageId };
}
