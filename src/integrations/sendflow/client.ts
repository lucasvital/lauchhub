import { getRawValue } from '../../db/global-config.js';
import { FatalError, TransientError } from '../_shared/errors.js';

/**
 * SendFlow REST client — only the endpoint we use: remove participants from
 * WhatsApp group(s) of a campaign (release). Docs: POST /actions/remove-participants.
 *
 * Auth: `Authorization: Bearer <api key>` — a single global key stored in
 * global_config under `sendflow_api_key` (read at runtime, never in the job).
 *
 * Rate limit: 5 req/s. On excess SendFlow returns 403 with
 * "Limite de operações atingido!" — treated as transient (BullMQ retries).
 */
const BASE_URL = 'https://sendapi.sendflow.pro';

export interface RemoveParticipantsInput {
  releaseId: string;
  groupIds: string[];
  participants: string[]; // phone numbers, e.g. "5535991891712"
}

export async function removeParticipants(input: RemoveParticipantsInput): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/actions/remove-participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        releaseId: input.releaseId,
        accountsFrom: 'release',
        to: { type: 'groups', ids: input.groupIds },
        data: { participants: input.participants },
      }),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  if (res.ok) return;

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  // 403 is rate limit ("Limite de operações") → transient; otherwise access denied → fatal.
  if (res.status === 403) {
    if (body.includes('Limite de opera')) {
      throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    }
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  // 5xx transient; 400/401/404 fatal (won't fix on retry).
  if (res.status >= 500) {
    throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  }
  throw new FatalError(`SendFlow ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}
