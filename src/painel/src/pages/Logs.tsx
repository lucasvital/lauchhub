import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type WorkerId, WORKERS } from '../lib/api';
import { Card, Badge, Button, Callout, SectionLabel, WorkerChip } from '../components/ui';

interface DlqJobData {
  event?: string;
  campaign_token?: string;
  contact?: { email?: string | null; phone?: string | null };
  correlation_id?: string;
}

interface DlqItem {
  id: string;
  worker: WorkerId;
  name: string;
  attempts: number;
  failedReason: string;
  data: DlqJobData;
  timestamp: number;
}

interface UnmatchedItem {
  id: string;
  token: string | null;
  payload: unknown;
  created_at: string;
}

function timeAgo(ts: number | string): string {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function LogsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'dlq' | 'unmatched'>('dlq');
  const [query, setQuery] = useState('');

  const dlq = useQuery({
    queryKey: ['dlq', { query }],
    queryFn: async () => {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const r = await api.get<{ ok: true; items: DlqItem[] }>(`/api/dlq${params}`);
      return r.items;
    },
    refetchInterval: 5_000,
  });

  const unmatched = useQuery({
    queryKey: ['unmatched', { query }],
    queryFn: async () => {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const r = await api.get<{ ok: true; items: UnmatchedItem[] }>(`/api/unmatched${params}`);
      return r.items;
    },
    refetchInterval: 8_000,
  });

  const retryOne = useMutation({
    mutationFn: ({ worker, id }: { worker: WorkerId; id: string }) =>
      api.post(`/api/dlq/${worker}/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq'] }),
  });

  const retryAll = useMutation({
    mutationFn: () => api.post<{ ok: true; retried: number }>('/api/dlq/retry-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq'] }),
  });

  const discard = useMutation({
    mutationFn: (id: string) => api.del(`/api/unmatched/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unmatched'] }),
  });

  const dlqItems = dlq.data ?? [];
  const unmatchedItems = unmatched.data ?? [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="04">Falhas terminais e eventos não-mapeados</SectionLabel>
          <h1>Logs &amp; DLQ</h1>
        </div>
        {tab === 'dlq' && dlqItems.length > 0 && (
          <Button onClick={() => retryAll.mutate()} disabled={retryAll.isPending}>
            {retryAll.isPending ? 'Reprocessando...' : `↻ Reprocessar todos (${dlqItems.length})`}
          </Button>
        )}
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab('dlq')}
          className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
            tab === 'dlq'
              ? 'border-b-2 border-accent-5 text-accent-5'
              : 'border-b-2 border-transparent text-muted hover:text-text'
          }`}
        >
          Dead Letter Queue
          <span className="ml-2 rounded-[10px] bg-dim px-2 py-0.5 text-[11px]">{dlqItems.length}</span>
        </button>
        <button
          onClick={() => setTab('unmatched')}
          className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
            tab === 'unmatched'
              ? 'border-b-2 border-accent-4 text-accent-4'
              : 'border-b-2 border-transparent text-muted hover:text-text'
          }`}
        >
          Eventos não-mapeados
          <span className="ml-2 rounded-[10px] bg-dim px-2 py-0.5 text-[11px]">{unmatchedItems.length}</span>
        </button>
      </div>

      <div className="mb-5">
        <input
          type="search"
          placeholder={tab === 'dlq' ? 'buscar em DLQ...' : 'buscar token...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72"
        />
      </div>

      {tab === 'dlq' && (
        <>
          {dlqItems.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-xs text-muted">
                <div className="font-display text-3xl text-accent-3">✓</div>
                <div className="mt-3">DLQ vazia — nenhum job falhou após todos os retries.</div>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {dlqItems.map((j) => {
                const workerMeta = WORKERS.find((w) => w.id === j.worker);
                const event = j.data?.event ?? null;
                const token = j.data?.campaign_token ?? null;
                const email = j.data?.contact?.email ?? null;
                const phone = j.data?.contact?.phone ?? null;
                return (
                  <Card key={`${j.worker}:${j.id}`} accent="red" tight>
                    <div className="flex items-start gap-4">
                      {workerMeta && (
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <WorkerChip workerId={workerMeta.id} glyph={workerMeta.glyph} size={36} />
                          <span className="text-[10px] uppercase tracking-[0.06em] text-muted">
                            {workerMeta.label}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          {event && (
                            <code className="rounded-sm bg-dim px-1.5 py-0.5 text-[12px] text-accent-2">
                              {event}
                            </code>
                          )}
                          {token && (
                            <code className="text-[12px] text-muted">
                              <span className="text-muted-2">token:</span> {token}
                            </code>
                          )}
                          <Badge color="red">{j.attempts}/4 tentativas</Badge>
                        </div>
                        {(email || phone) && (
                          <div className="mb-1.5 text-[12px] text-muted">
                            {email && <span>{email}</span>}
                            {email && phone && <span className="mx-1.5 text-muted-2">·</span>}
                            {phone && <span>{phone}</span>}
                          </div>
                        )}
                        <div className="rounded-sm border border-accent-5/30 bg-accent-5/[0.06] px-3 py-2 text-[12px] leading-relaxed text-accent-5 break-words">
                          {j.failedReason || 'sem detalhe do erro'}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-2 pt-0.5">
                        <span className="text-[11px] text-muted-2">{timeAgo(j.timestamp)}</span>
                        <Button
                          size="sm"
                          onClick={() => retryOne.mutate({ worker: j.worker, id: j.id })}
                          disabled={retryOne.isPending}
                        >
                          ↻ Reprocessar
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'unmatched' && (
        <>
          <Callout kind="warn">
            Eventos chegando em tokens não cadastrados. O gateway sempre responde 200 ao Kiwify, mas o payload fica aqui para você criar a campanha ou descartar.
          </Callout>
          {unmatchedItems.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-xs text-muted">
                <div className="font-display text-3xl text-accent-3">✓</div>
                <div className="mt-3">Tudo certo — todos os webhooks bateram com uma campanha.</div>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {unmatchedItems.map((u) => (
                <UnmatchedRow key={u.id} item={u} onDiscard={() => discard.mutate(u.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface KiwifyPreview {
  webhook_event_type?: string;
  order_status?: string;
  order_id?: string;
  Customer?: { full_name?: string; email?: string; mobile?: string };
  Product?: { product_name?: string };
  Products?: Array<{ name?: string; product_name?: string }>;
}

function UnmatchedRow({
  item,
  onDiscard,
}: {
  item: UnmatchedItem;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const p = (item.payload ?? {}) as KiwifyPreview;
  const eventType = p.webhook_event_type ?? p.order_status ?? '—';
  const customerName = p.Customer?.full_name ?? null;
  const customerEmail = p.Customer?.email ?? null;
  const productName =
    p.Product?.product_name ?? p.Products?.[0]?.name ?? p.Products?.[0]?.product_name ?? null;

  return (
    <Card accent="amber" tight>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge color="amber">SEM CAMPANHA</Badge>
            <code className="text-[12px] text-accent-4">
              <span className="text-muted-2">token:</span> {item.token ?? '(vazio)'}
            </code>
            <code className="rounded-sm bg-dim px-1.5 py-0.5 text-[11px] text-accent-2">
              {eventType}
            </code>
          </div>
          {(customerName || customerEmail || productName) && (
            <div className="text-[12px] text-muted">
              {customerName && <span className="text-text">{customerName}</span>}
              {customerName && customerEmail && <span className="mx-1.5 text-muted-2">·</span>}
              {customerEmail && <span>{customerEmail}</span>}
              {(customerName || customerEmail) && productName && (
                <span className="mx-1.5 text-muted-2">·</span>
              )}
              {productName && <span className="text-accent-2">{productName}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <span className="text-[11px] text-muted-2">{timeAgo(item.created_at)}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              {open ? '▼ ocultar JSON' : '▶ ver JSON'}
            </Button>
            <Button size="sm" variant="danger" onClick={onDiscard}>
              Descartar
            </Button>
          </div>
        </div>
      </div>
      {open && (
        <pre className="mt-3 max-h-96 overflow-auto rounded border border-border bg-dim p-3 text-[12px] leading-relaxed text-muted">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      )}
    </Card>
  );
}
