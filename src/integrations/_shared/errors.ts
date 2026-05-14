/**
 * Shared error types for all integrations.
 *
 * - `FatalError`: do NOT retry (auth, invalid template, contact blocked, etc.)
 * - `TransientError`: retry per BullMQ policy (5xx, 429, network, etc.)
 *
 * Workers translate API responses into these. BullMQ retries TransientError
 * up to the configured attempts; FatalError is moved straight to failed state.
 */
export class FatalError extends Error {
  readonly fatal = true;
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'FatalError';
  }
}

export class TransientError extends Error {
  readonly fatal = false;
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TransientError';
  }
}

export function classifyHttpError(status: number, body?: unknown): FatalError | TransientError {
  if (status === 401 || status === 403) {
    return new FatalError(`HTTP ${status} auth failed`, `http_${status}`);
  }
  if (status === 429) {
    return new TransientError(`HTTP 429 rate limited`, 'rate_limited');
  }
  if (status >= 500) {
    return new TransientError(`HTTP ${status} upstream error`, `http_${status}`);
  }
  // 400-class non-auth: usually validation — fatal (won't fix on retry)
  return new FatalError(`HTTP ${status}: ${JSON.stringify(body ?? '').slice(0, 200)}`, `http_${status}`);
}
