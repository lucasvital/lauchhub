import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type WorkerId, WORKERS } from '../lib/api';
import { Card, Badge, Button, Callout, SectionLabel, WorkerChip } from '../components/ui';

interface DlqItem {
  id: string;
  worker: WorkerId;
  name: string;
  attempts: number;
  failedReason: string;
  data: unknown;
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
          <span className="ml-2 rounded-[10px] bg-dim px-2 py-0.5 text-[9px]">{dlqItems.length}</span>
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
          <span className="ml-2 rounded-[10px] bg-dim px-2 py-0.5 text-[9px]">{unmatchedItems.length}</span>
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
                return (
                  <Card key={`${j.worker}:${j.id}`} accent="red" tight>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {workerMeta && (
                          <WorkerChip workerId={workerMeta.id} glyph={workerMeta.glyph} size={20} />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-text">{j.name}</span>
                            <Badge color="red">{j.attempts}/4 tentativas</Badge>
                          </div>
                          <div className="truncate text-[11px] text-accent-5">{j.failedReason}</div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="text-[10px] text-muted-2">{timeAgo(j.timestamp)}</span>
                        <Button
                          size="sm"
                          onClick={() => retryOne.mutate({ worker: j.worker, id: j.id })}
                          disabled={retryOne.isPending}
                        >
                          Reprocessar
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
                <Card key={u.id} accent="amber" tight>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text">
                        token: <code className="text-accent-4">{u.token ?? '(vazio)'}</code>
                      </span>
                      <Badge color="amber">SEM CAMPANHA</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-2">{timeAgo(u.created_at)}</span>
                      <Button size="sm" variant="danger" onClick={() => discard.mutate(u.id)}>
                        Descartar
                      </Button>
                    </div>
                  </div>
                  <pre className="overflow-x-auto rounded border border-border bg-dim p-3 text-[10px] text-muted">
                    {JSON.stringify(u.payload, null, 2)}
                  </pre>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
