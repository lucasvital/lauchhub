import { useState, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Campaign, type ApiError, WORKERS } from '../lib/api';
import { Card, Badge, Button, SectionLabel, WorkerChip } from '../components/ui';

export function CampaignsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({
    queryKey: ['campaigns', { query, statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (statusFilter !== 'all') params.set('active', String(statusFilter === 'active'));
      const r = await api.get<{ ok: true; campaigns: Campaign[] }>(
        `/api/campaigns${params.toString() ? `?${params}` : ''}`,
      );
      return r.campaigns;
    },
  });

  const campaigns = list.data ?? [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="02">{campaigns.length} campanhas</SectionLabel>
          <h1>Campanhas</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative w-60">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">⌕</span>
            <input
              type="search"
              placeholder="buscar por nome, token, produto..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button onClick={() => setShowNew(true)}>+ Nova campanha</Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(['all', 'active', 'paused'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-sm border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              statusFilter === f
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:border-border-2 hover:text-text'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'active' ? 'Ativas' : 'Pausadas'}
          </button>
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-dim border-b border-border">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Status
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Token / Nome
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Produto
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Workers
              </th>
              <th className="w-12 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="py-16 text-center text-xs text-muted">
                  {list.isLoading ? 'carregando...' : 'nenhuma campanha encontrada'}
                </td>
              </tr>
            )}
            {campaigns.map((c) => {
              const enabledSet = new Set<string>();
              Object.values(c.enabled_workers ?? {}).forEach((arr) =>
                (arr ?? []).forEach((w) => enabledSet.add(w)),
              );
              return (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-white/[0.015]"
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    {c.active ? (
                      <Badge color="green" dot>
                        ATIVA
                      </Badge>
                    ) : (
                      <Badge color="muted">PAUSADA</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-[3px] bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {c.campaign_token}
                    </span>
                    <div className="mt-1 text-[11px] text-muted">{c.name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{c.product_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {WORKERS.map((w) => (
                        <WorkerChip
                          key={w.id}
                          workerId={w.id}
                          glyph={w.glyph}
                          active={enabledSet.has(w.id)}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-2">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [tokenTouched, setTokenTouched] = useState(false);
  const [token, setToken] = useState('');
  const [productId, setProductId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const suggestedToken = useMemo(() => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w.slice(0, 4))
      .join('-');
  }, [name]);

  const effectiveToken = tokenTouched ? token : suggestedToken;
  const tokenValid = /^[a-z0-9-]+$/.test(effectiveToken);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; campaign: Campaign }>('/api/campaigns', {
        name: name.trim(),
        campaign_token: effectiveToken,
        product_id: productId.trim() || null,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
      navigate(`/campaigns/${data.campaign.id}`);
    },
    onError: (err) => {
      const apiErr = err as ApiError;
      if (apiErr.code === 'token_taken') setError('Token já usado por outra campanha.');
      else setError('Erro ao criar campanha.');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !tokenValid) return;
    create.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h3>Nova campanha</h3>
          <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-border hover:text-text">
            ✕
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Nome
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Token
            </span>
            <input
              value={effectiveToken}
              onChange={(e) => {
                setToken(e.target.value);
                setTokenTouched(true);
              }}
              required
            />
            <span className="mt-1 block text-[10px] text-muted-2">
              URL: <code className="text-accent-2">/webhook/{effectiveToken || '...'}</code>
            </span>
            {!tokenValid && effectiveToken && (
              <span className="mt-1 block text-[10px] text-accent-5">apenas a-z, 0-9 e hífen</span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Product ID Kiwify (opcional)
            </span>
            <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="kw_prod_..." />
          </label>
          {error && <div className="text-[11px] text-accent-5">{error}</div>}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border bg-bg px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending || !tokenValid || !name.trim()}>
            {create.isPending ? 'Criando...' : 'Criar campanha'}
          </Button>
        </div>
      </form>
    </div>
  );
}
