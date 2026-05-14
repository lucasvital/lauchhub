import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';

export interface MauticAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface TokenState {
  access_token: string;
  expires_at: number; // ms epoch
}

/**
 * In-memory OAuth2 token store with refresh-ahead.
 * Refreshes 60s before expiry to avoid 401-mid-request.
 */
let cached: TokenState | null = null;

export async function getAccessToken(cfg: MauticAuthConfig, fetcher: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (cached && cached.expires_at - 60_000 > now) return cached.access_token;

  let res: Response;
  try {
    res = await fetcher(`${cfg.baseUrl.replace(/\/$/, '')}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
  } catch (err) {
    throw new TransientError(`Mautic OAuth network error: ${String(err)}`, 'network');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401) {
      throw new FatalError(`Mautic OAuth ${res.status}: ${body.slice(0, 200)}`, 'oauth_failed');
    }
    throw classifyHttpError(res.status, body);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  if (!data.access_token) throw new FatalError('Mautic OAuth: no access_token in response', 'bad_response');
  cached = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in ?? 3600) * 1000,
  };
  return cached.access_token;
}

export function __resetTokenCache(): void {
  cached = null;
}
