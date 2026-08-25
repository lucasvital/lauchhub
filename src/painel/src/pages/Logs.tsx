import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, EVENTS, type EventId, type WorkerId, WORKERS } from '../lib/api';
import { Card, Badge, Button, Callout, SectionLabel, WorkerChip } from '../components/ui';

type DateFilter = 'all' | '1h' | '24h' | '7d';

const DATE_FILTERS: { id: DateFilter; label: string; ms: number | null }[] = [
  { id: 'all', label: 'todo período', ms: null },
  { id: '1h', label: 'última 1h', ms: 60 * 60_000 },
  { id: '24h', label: 'últimas 24h', ms: 24 * 60 * 60_000 },
  { id: '7d', label: 'últimos 7 dias', ms: 7 * 24 * 60 * 60_000 },
];

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

interface WebhookItem {
  id: string;
  token: string | null;
  event: string | null;
  campaign_token: string | null;
  outcome: string;
  workers: string[] | null;
  jobs_enqueued: number;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  payload: unknown;
  created_at: string;
}

const OUTCOME_META: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'cyan' | 'purple' }> = {
  enqueued: { label: 'PROCESSADO', color: 'green' },
  no_workers_enabled: { label: 'SEM WORKER ATIVO', color: 'amber' },
  skipped_other_offer: { label: 'OUTRA OFERTA', color: 'purple' },
  unmatched: { label: 'SEM CAMPANHA', color: 'amber' },
  inactive: { label: 'CAMPANHA PAUSADA', color: 'purple' },
  unrecognized_event: { label: 'EVENTO DESCONHECIDO', color: 'cyan' },
  no_contact: { label: 'SEM CONTATO', color: 'red' },
  error: { label: 'ERRO INTERNO', color: 'red' },
};

const OUTCOME_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'todos' },
  { id: 'enqueued', label: 'Processados' },
  { id: 'no_workers_enabled', label: 'Sem worker ativo' },
  { id: 'skipped_other_offer', label: 'Outra oferta' },
  { id: 'unmatched', label: 'Sem campanha' },
  { id: 'inactive', label: 'Campanha pausada' },
  { id: 'unrecognized_event', label: 'Evento desconhecido' },
  { id: 'no_contact', label: 'Sem contato' },
  { id: 'error', label: 'Erro interno' },
];

/**
 * Match Kiwify raw event tokens (e.g. "abandoned_cart", "pix.generated") to
 * our canonical EventId. Used to filter unmatched events whose payload
 * carries Kiwify-shape strings rather than our enum.
 */
function eventLabelMatches(kiwifyToken: string, eventId: EventId): boolean {
  const t = kiwifyToken.toLowerCase();
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) return false;
  return t === eventId || t === ev.sub.toLowerCase() || t.startsWith(ev.sub.toLowerCase());
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
  const [tab, setTab] = useState<'received' | 'dlq' | 'unmatched'>('received');
  const [query, setQuery] = useState('');
  const [workerFilter, setWorkerFilter] = useState<WorkerId | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<EventId | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const dateCutoff = useMemo(() => {
    const ms = DATE_FILTERS.find((d) => d.id === dateFilter)?.ms ?? null;
    return ms ? Date.now() - ms : null;
  }, [dateFilter]);

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

  const received = useQuery({
    queryKey: ['webhooks', { query }],
    queryFn: async () => {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const r = await api.get<{ ok: true; items: WebhookItem[] }>(`/api/webhooks${params}`);
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

  const allDlq = dlq.data ?? [];
  const allUnmatched = unmatched.data ?? [];
  const allReceived = received.data ?? [];

  const receivedItems = useMemo(
    () =>
      allReceived.filter((w) => {
        if (dateCutoff !== null && new Date(w.created_at).getTime() < dateCutoff) return false;
        if (eventFilter !== 'all' && w.event !== eventFilter) return false;
        if (outcomeFilter !== 'all' && w.outcome !== outcomeFilter) return false;
        return true;
      }),
    [allReceived, eventFilter, outcomeFilter, dateCutoff],
  );

  const dlqItems = useMemo(
    () =>
      allDlq.filter((j) => {
        if (workerFilter !== 'all' && j.worker !== workerFilter) return false;
        if (eventFilter !== 'all' && j.data?.event !== eventFilter) return false;
        if (dateCutoff !== null && j.timestamp < dateCutoff) return false;
        return true;
      }),
    [allDlq, workerFilter, eventFilter, dateCutoff],
  );

  const unmatchedItems = useMemo(
    () =>
      allUnmatched.filter((u) => {
        if (dateCutoff !== null && new Date(u.created_at).getTime() < dateCutoff) return false;
        if (eventFilter !== 'all') {
          const p = (u.payload ?? {}) as { webhook_event_type?: string; order_status?: string };
          // Map Kiwify raw event_type/status to our EventId for filter compare
          const candidates = [p.webhook_event_type, p.order_status].filter(Boolean) as string[];
          const matchesEvent = candidates.some(
            (c) => eventLabelMatches(c, eventFilter),
          );
          if (!matchesEvent) return false;
        }
        return true;
      }),
    [allUnmatched, eventFilter, dateCutoff],
  );

  const activeFilters =
    (workerFilter !== 'all' ? 1 : 0) +
    (eventFilter !== 'all' ? 1 : 0) +
    (outcomeFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setWorkerFilter('all');
    setEventFilter('all');
    setOutcomeFilter('all');
    setDateFilter('all');
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="04">Webhooks recebidos, falhas terminais e não-mapeados</SectionLabel>
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
          onClick={() => setTab('received')}
          className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
            tab === 'received'
              ? 'border-b-2 border-accent text-accent'
              : 'border-b-2 border-transparent text-muted hover:text-text'
          }`}
        >
          Webhooks recebidos
          <span className="ml-2 rounded-[10px] bg-dim px-2 py-0.5 text-[11px]">{receivedItems.length}</span>
        </button>
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

      <Card tight className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[260px] flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Buscar
            </span>
            <input
              type="search"
              placeholder={
                tab === 'dlq' ? 'erro, email, token, correlation_id…' : 'token, email, produto…'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {tab === 'dlq' && (
            <label className="block min-w-[160px]">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Worker
              </span>
              <select
                value={workerFilter}
                onChange={(e) => setWorkerFilter(e.target.value as WorkerId | 'all')}
              >
                <option value="all">todos</option>
                {WORKERS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tab === 'received' && (
            <label className="block min-w-[190px]">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Desfecho
              </span>
              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
                {OUTCOME_FILTERS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block min-w-[200px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Evento
            </span>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as EventId | 'all')}
            >
              <option value="all">todos</option>
              {EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[160px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Período
            </span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              {DATE_FILTERS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              ✕ limpar ({activeFilters})
            </Button>
          )}
        </div>
        <div className="mt-2 text-[11px] text-muted-2">
          {tab === 'dlq'
            ? `${dlqItems.length} de ${allDlq.length} jobs`
            : tab === 'unmatched'
              ? `${unmatchedItems.length} de ${allUnmatched.length} eventos`
              : `${receivedItems.length} de ${allReceived.length} webhooks`}
        </div>
      </Card>

      {tab === 'received' && (
        <>
          <Callout kind="info">
            Todo webhook que o gateway recebe é registrado aqui com seu desfecho — processado ou
            não. Um evento com <strong>nenhum worker ativo</strong> (ex: abandono de carrinho sem
            worker ligado) aparece como <code>SEM WORKER ATIVO</code> e não some.
          </Callout>
          {receivedItems.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-xs text-muted">
                <div className="font-display text-3xl text-muted-2">∅</div>
                <div className="mt-3">Nenhum webhook recebido no filtro atual.</div>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {receivedItems.map((w) => (
                <WebhookRow key={w.id} item={w} />
              ))}
            </div>
          )}
        </>
      )}

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

function WebhookRow({ item }: { item: WebhookItem }) {
  const [open, setOpen] = useState(false);
  const meta = OUTCOME_META[item.outcome] ?? { label: item.outcome.toUpperCase(), color: 'cyan' as const };
  const eventLabel = EVENTS.find((e) => e.id === item.event)?.label ?? item.event ?? '—';
  const p = (item.payload ?? {}) as { checkout_link?: string; Product?: { product_offer_name?: string } };
  const checkoutLink = p.checkout_link ?? null;
  const offerName = p.Product?.product_offer_name ?? null;

  return (
    <Card accent={meta.color} tight>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            <code className="rounded-sm bg-dim px-1.5 py-0.5 text-[12px] text-accent-2">{eventLabel}</code>
            {item.campaign_token && (
              <code className="text-[12px] text-muted">
                <span className="text-muted-2">token:</span> {item.campaign_token}
              </code>
            )}
            {checkoutLink && (
              <code className="rounded-sm bg-dim px-1.5 py-0.5 text-[12px] text-accent-4">
                <span className="text-muted-2">checkout:</span> {checkoutLink}
              </code>
            )}
            {offerName && <Badge color="cyan">{offerName}</Badge>}
            {item.outcome === 'enqueued' && item.workers && item.workers.length > 0 && (
              <span className="flex items-center gap-1">
                {item.workers.map((wid) => {
                  const wm = WORKERS.find((w) => w.id === wid);
                  return wm ? <WorkerChip key={wid} workerId={wm.id} glyph={wm.glyph} size={18} /> : null;
                })}
              </span>
            )}
          </div>
          {(item.contact_name || item.contact_email || item.product_name) && (
            <div className="text-[12px] text-muted">
              {item.contact_name && <span className="text-text">{item.contact_name}</span>}
              {item.contact_name && item.contact_email && <span className="mx-1.5 text-muted-2">·</span>}
              {item.contact_email && <span>{item.contact_email}</span>}
              {(item.contact_name || item.contact_email) && item.product_name && (
                <span className="mx-1.5 text-muted-2">·</span>
              )}
              {item.product_name && <span className="text-accent-2">{item.product_name}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <span className="text-[11px] text-muted-2">{timeAgo(item.created_at)}</span>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? '▼ ocultar JSON' : '▶ ver JSON'}
          </Button>
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
