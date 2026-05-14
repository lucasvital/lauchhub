const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface ApiError extends Error {
  status: number;
  code?: string;
}

class HttpError extends Error implements ApiError {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (res.status === 401) {
    // Let route guards react via thrown error
    throw new HttpError('unauthorized', 401, 'unauthorized');
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new HttpError(
      (body.error as string | undefined) ?? `HTTP ${res.status}`,
      res.status,
      body.error as string | undefined,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type WorkerId = 'sheets' | 'chatwoot' | 'mautic' | 'meta';

export type EventId =
  | 'compra_aprovada'
  | 'carrinho_abandonado'
  | 'pix_gerado'
  | 'boleto_gerado'
  | 'compra_recusada'
  | 'compra_reembolsada'
  | 'subscription_canceled'
  | 'subscription_renewed';

export interface Campaign {
  id: string;
  name: string;
  campaign_token: string;
  product_id: string | null;
  product_name: string | null;
  expert_name: string | null;
  sheets_id: string | null;
  chatwoot_instance_id: string | null;
  mautic_instance_id: string | null;
  meta_instance_id: string | null;
  chatwoot_inbox_id: number | null;
  chatwoot_tags: Record<string, string[]>;
  mautic_segment_id: number | null;
  mautic_tags: Record<string, string[]>;
  meta_templates: Record<string, string>;
  enabled_workers: Record<string, WorkerId[]>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstanceSummary {
  id: string;
  name: string;
}

export interface DashboardSummary {
  ok: true;
  byWorker: Record<WorkerId, { waiting: number; active: number; failed: number; completed: number; delayed: number }>;
  totals: { waiting: number; active: number; failed: number; completed: number; delayed: number };
}

export const EVENTS: { id: EventId; label: string; sub: string; color: string }[] = [
  { id: 'compra_aprovada', label: 'Compra Aprovada', sub: 'paid', color: 'green' },
  { id: 'carrinho_abandonado', label: 'Carrinho Abandonado', sub: 'abandoned_cart', color: 'amber' },
  { id: 'pix_gerado', label: 'Pix Gerado', sub: 'pix.generated', color: 'cyan' },
  { id: 'boleto_gerado', label: 'Boleto Gerado', sub: 'billet.generated', color: 'cyan' },
  { id: 'compra_recusada', label: 'Compra Recusada', sub: 'refused', color: 'red' },
  { id: 'compra_reembolsada', label: 'Compra Reembolsada', sub: 'refunded', color: 'red' },
  { id: 'subscription_canceled', label: 'Subscription Canceled', sub: 'sub.canceled', color: 'red' },
  { id: 'subscription_renewed', label: 'Subscription Renewed', sub: 'sub.renewed', color: 'green' },
];

export const WORKERS: { id: WorkerId; label: string; color: string; glyph: string }[] = [
  { id: 'sheets', label: 'Sheets', color: 'green', glyph: 'S' },
  { id: 'chatwoot', label: 'Chatwoot', color: 'cyan', glyph: 'C' },
  { id: 'mautic', label: 'Mautic', color: 'purple', glyph: 'M' },
  { id: 'meta', label: 'Meta', color: 'amber', glyph: 'W' },
];
