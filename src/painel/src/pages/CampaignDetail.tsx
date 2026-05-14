import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Campaign,
  type InstanceSummary,
  EVENTS,
  WORKERS,
  type EventId,
  type WorkerId,
} from '../lib/api';
import { Card, Badge, Button, Callout, WorkerChip } from '../components/ui';

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const q = useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => api.get<{ ok: true; campaign: Campaign }>(`/api/campaigns/${id}`),
  });

  const toggleActive = useMutation({
    mutationFn: () => api.post<{ ok: true; campaign: Campaign }>(`/api/campaigns/${id}/toggle-active`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', id] }),
  });

  const updateWorkers = useMutation({
    mutationFn: (vars: { event: EventId; workers: WorkerId[] }) =>
      api.put<{ ok: true; campaign: Campaign }>(`/api/campaigns/${id}/workers/${vars.event}`, {
        workers: vars.workers,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', id] }),
  });

  const patchCampaign = useMutation({
    mutationFn: (patch: Partial<Campaign>) =>
      api.patch<{ ok: true; campaign: Campaign }>(`/api/campaigns/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', id] }),
  });

  const mauticInstances = useQuery({
    queryKey: ['instances', 'mautic'],
    queryFn: () => api.get<{ ok: true; items: InstanceSummary[] }>('/api/instances/mautic'),
    select: (r) => r.items,
  });
  const chatwootInstances = useQuery({
    queryKey: ['instances', 'chatwoot'],
    queryFn: () => api.get<{ ok: true; items: InstanceSummary[] }>('/api/instances/chatwoot'),
    select: (r) => r.items,
  });
  const metaInstances = useQuery({
    queryKey: ['instances', 'meta'],
    queryFn: () => api.get<{ ok: true; items: InstanceSummary[] }>('/api/instances/meta'),
    select: (r) => r.items,
  });

  if (q.isLoading) return <div className="py-16 text-center text-xs text-muted">carregando...</div>;
  if (q.error || !q.data) {
    return (
      <div className="py-16 text-center">
        <div className="font-display text-3xl text-muted-2">404</div>
        <div className="mt-3 text-xs text-muted">Campanha não encontrada</div>
        <div className="mt-5">
          <Button variant="ghost" onClick={() => navigate('/campaigns')}>
            ← Voltar
          </Button>
        </div>
      </div>
    );
  }

  const c = q.data.campaign;
  const webhookUrl = `${location.origin.replace('://launchhub', '://launches')}/webhook/${c.campaign_token}`;
  const apiUrl = `${import.meta.env.VITE_API_BASE_URL ?? location.origin}/webhook/${c.campaign_token}`;

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(apiUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  function toggleWorker(event: EventId, worker: WorkerId) {
    const currentSet = new Set(c.enabled_workers[event] ?? []);
    if (currentSet.has(worker)) currentSet.delete(worker);
    else currentSet.add(worker);
    updateWorkers.mutate({ event, workers: [...currentSet] });
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em]">
            <Link to="/campaigns" className="text-muted hover:text-text">
              ← campanhas
            </Link>
            <span className="text-muted-2">/</span>
            <span className="rounded-[3px] bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              {c.campaign_token}
            </span>
          </div>
          <h1>{c.name}</h1>
          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
            <span>{c.product_name ?? '—'}</span>
            <span className="text-muted-2">·</span>
            <span>criada em {new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant={c.active ? 'ghost' : 'primary'}
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
          >
            {c.active ? 'Pausar' : 'Ativar'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <h3 className="mb-3">// Webhook URL</h3>
        <div className="flex items-center gap-2.5 overflow-x-auto rounded border border-dashed border-border-2 bg-dim px-3 py-2.5 font-mono text-[11px]">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted">POST</span>
          <code className="whitespace-nowrap text-accent-2">{apiUrl || webhookUrl}</code>
          <button
            onClick={copyWebhook}
            className="ml-auto rounded-sm border border-border px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {copied ? '✓ copiado' : 'copiar'}
          </button>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-4">// Integrações desta campanha</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Expert / produto
            </span>
            <input
              defaultValue={c.expert_name ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (c.expert_name ?? ''))
                  patchCampaign.mutate({ expert_name: e.target.value || null });
              }}
              placeholder="ex: João Silva"
            />
          </label>
          <InstanceSelect
            label="Mautic instance"
            value={c.mautic_instance_id}
            options={mauticInstances.data ?? []}
            onChange={(v) => patchCampaign.mutate({ mautic_instance_id: v })}
          />
          <InstanceSelect
            label="Chatwoot instance"
            value={c.chatwoot_instance_id}
            options={chatwootInstances.data ?? []}
            onChange={(v) => patchCampaign.mutate({ chatwoot_instance_id: v })}
          />
          <InstanceSelect
            label="Meta (WhatsApp) instance"
            value={c.meta_instance_id}
            options={metaInstances.data ?? []}
            onChange={(v) => patchCampaign.mutate({ meta_instance_id: v })}
          />
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Chatwoot inbox ID
            </span>
            <input
              type="number"
              defaultValue={c.chatwoot_inbox_id ?? ''}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== c.chatwoot_inbox_id)
                  patchCampaign.mutate({ chatwoot_inbox_id: v });
              }}
              placeholder="14"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Mautic segment ID
            </span>
            <input
              type="number"
              defaultValue={c.mautic_segment_id ?? ''}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== c.mautic_segment_id)
                  patchCampaign.mutate({ mautic_segment_id: v });
              }}
              placeholder="38"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Google Sheets — Spreadsheet ID
            </span>
            <input
              defaultValue={c.sheets_id ?? ''}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== c.sheets_id) patchCampaign.mutate({ sheets_id: v });
              }}
              placeholder="1a2B3cD4..."
            />
          </label>
        </div>
        <Callout kind="tip">
          Quando o dropdown está em "— fallback global —", as credenciais vêm do <code>.env</code> do
          servidor. Cadastre instâncias em <Link to="/instances" className="underline">Integrações</Link>{' '}
          pra dar credencial diferente por campanha.
        </Callout>
      </Card>

      <Callout kind="tip">
        Toggle por evento × worker. As alterações salvam imediatamente.
      </Callout>

      <Card className="!p-0 overflow-hidden">
        <div
          className="grid border-b border-border bg-dim"
          style={{ gridTemplateColumns: '220px repeat(4, 1fr)' }}
        >
          <div className="px-3.5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
            Evento
          </div>
          {WORKERS.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted"
            >
              <WorkerChip workerId={w.id} glyph={w.glyph} />
              <span>{w.label}</span>
            </div>
          ))}
        </div>

        {EVENTS.map((ev) => {
          const enabled = c.enabled_workers[ev.id] ?? [];
          return (
            <div
              key={ev.id}
              className="grid border-b border-border last:border-0 transition-colors hover:bg-white/[0.01]"
              style={{ gridTemplateColumns: '220px repeat(4, 1fr)' }}
            >
              <div className="px-3.5 py-3">
                <div className="text-xs font-medium text-text">{ev.label}</div>
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted-2">{ev.sub}</div>
              </div>
              {WORKERS.map((w) => {
                const on = enabled.includes(w.id);
                return (
                  <div key={w.id} className="flex items-center justify-center px-3.5 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={updateWorkers.isPending}
                      onClick={() => toggleWorker(ev.id, w.id)}
                      className={`relative h-[18px] w-8 rounded-[10px] border transition-colors ${
                        on ? 'border-accent bg-accent/15' : 'border-border bg-dim'
                      } disabled:opacity-50`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
                          on ? 'bg-accent translate-x-3.5' : 'bg-muted'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card accent="cyan">
          <h3>// Chatwoot</h3>
          <div className="mt-3 space-y-2 text-[11px]">
            <div>
              <span className="text-muted">Inbox ID:</span>{' '}
              <span className="text-text">{c.chatwoot_inbox_id ?? '—'}</span>
            </div>
            {Object.entries(c.chatwoot_tags ?? {}).map(([ev, tags]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(tags ?? []).map((t) => (
                    <Badge key={t} color="cyan">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card accent="purple">
          <h3>// Mautic</h3>
          <div className="mt-3 space-y-2 text-[11px]">
            <div>
              <span className="text-muted">Segment ID:</span>{' '}
              <span className="text-text">{c.mautic_segment_id ?? '—'}</span>
            </div>
            {Object.entries(c.mautic_tags ?? {}).map(([ev, tags]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(tags ?? []).map((t) => (
                    <Badge key={t} color="purple">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card accent="green">
          <h3>// Google Sheets</h3>
          <div className="mt-3 text-[11px]">
            <span className="text-muted">Spreadsheet ID:</span>{' '}
            <code className="text-accent-3">{c.sheets_id ?? '—'}</code>
          </div>
        </Card>
        <Card accent="amber">
          <h3>// Meta Templates</h3>
          <div className="mt-3 space-y-1.5 text-[11px]">
            {Object.entries(c.meta_templates ?? {}).map(([ev, tpl]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>{' '}
                <span className="text-muted">→</span>{' '}
                <code className="text-accent-4">{tpl}</code>
              </div>
            ))}
            {Object.keys(c.meta_templates ?? {}).length === 0 && (
              <div className="text-muted-2">— sem templates configurados</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InstanceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: InstanceSummary[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— fallback global —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
