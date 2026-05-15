export interface MauticAuthConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * Mautic supports HTTP Basic Auth when enabled in Settings → Configuration
 * → API Settings. We use the admin user's credentials directly — no token
 * exchange, no expiry, no refresh.
 */
export function basicAuthHeader(cfg: { username: string; password: string }): string {
  const token = Buffer.from(`${cfg.username}:${cfg.password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}
