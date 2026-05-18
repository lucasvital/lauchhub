import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Campaign,
  type ChatwootEventConfig,
  type ChatwootInboxOption,
  type ChatwootLabelOption,
  type ChatwootTemplateOption,
  type EventId,
  type InstanceSummary,
  type MauticEventConfig,
  type MauticFieldOption,
  type MauticSegmentOption,
  type MauticTagOption,
  type MetaTemplateConfig,
  type SheetTabOption,
  type WorkerId,
  EVENTS,
  WORKERS,
} from '../lib/api';
import { Card, Button, Callout, WorkerChip } from '../components/ui';

function emptyMauticEventConfig(): MauticEventConfig {
  return {
    segments_add: [],
    segments_remove: [],
    tags_add: [],
    tags_remove: [],
    custom_fields: {},
    skip_if_has_tag: [],
  };
}

function emptyChatwootEventConfig(): ChatwootEventConfig {
  return { labels_add: [], labels_remove: [], skip_if_has_label: [] };
}

function emptyMetaTemplateConfig(): MetaTemplateConfig {
  return { template_name: '', template_params: {}, language: 'pt_BR' };
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';

/**
 * Debounced auto-save for per-event config editors.
 *
 * Every time `draft` changes (via `setDraft`), a 800ms timer schedules a
 * `patch()` call. While the user keeps typing the timer resets. Saving while
 * a mutation is in flight is naturally suppressed (we only patch when the
 * draft differs from the latest known config).
 *
 * The hook returns a `status` for UI feedback: idle | dirty | saving | saved.
 */
function useAutoSavedEvent<T>(opts: {
  selectedEvent: EventId;
  config: Partial<Record<EventId, T>>;
  emptyDraft: () => T;
  patch: (next: Partial<Record<EventId, T>>) => void;
  saving: boolean;
}) {
  const { selectedEvent, config, emptyDraft, patch, saving } = opts;
  const initial = useMemo(
    () => config[selectedEvent] ?? emptyDraft(),
    // emptyDraft is a stable function but deps must include selectedEvent + config
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, selectedEvent],
  );
  const [draft, setDraft] = useState<T>(initial);
  const [showSaved, setShowSaved] = useState(false);

  // Reset draft when switching event or when external config refetches with new data
  const externalKey = `${selectedEvent}:${JSON.stringify(initial)}`;
  const lastKeyRef = useRef(externalKey);
  if (externalKey !== lastKeyRef.current) {
    lastKeyRef.current = externalKey;
    setDraft(initial);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // Debounce save 800ms after the last edit
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || saving) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      patch({ ...config, [selectedEvent]: draft });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  const status: SaveStatus = saving ? 'saving' : dirty ? 'dirty' : showSaved ? 'saved' : 'idle';

  return { draft, setDraft, status };
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const text =
    status === 'saving' ? 'salvando…' : status === 'saved' ? '✓ salvo' : 'alterações pendentes';
  const color =
    status === 'saved' ? 'text-accent-3' : status === 'saving' ? 'text-muted' : 'text-accent-4';
  return <span className={`text-[11px] ${color}`}>{text}</span>;
}

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
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em]">
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
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted">POST</span>
          <code className="whitespace-nowrap text-accent-2">{apiUrl || webhookUrl}</code>
          <button
            onClick={copyWebhook}
            className="ml-auto rounded-sm border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {copied ? '✓ copiado' : 'copiar'}
          </button>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-4">// Integrações desta campanha</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
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
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
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
          <SheetsPicker
            sheetsId={c.sheets_id}
            sheetsTab={c.sheets_tab}
            onChangeId={(v) => patchCampaign.mutate({ sheets_id: v })}
            onChangeTab={(v) => patchCampaign.mutate({ sheets_tab: v })}
          />
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
          <div className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Evento
          </div>
          {WORKERS.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
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
                <div className="text-[10px] uppercase tracking-[0.06em] text-muted-2">{ev.sub}</div>
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

      <ChatwootEventEditor
        chatwootInstanceId={c.chatwoot_instance_id}
        config={c.chatwoot_event_config}
        onSave={(next) => patchCampaign.mutate({ chatwoot_event_config: next })}
        saving={patchCampaign.isPending}
      />

      <MauticEventEditor
        mauticInstanceId={c.mautic_instance_id}
        config={c.mautic_event_config}
        onSave={(next) => patchCampaign.mutate({ mautic_event_config: next })}
        saving={patchCampaign.isPending}
      />

      <MetaTemplatesEditor
        chatwootInstanceId={c.chatwoot_instance_id}
        chatwootInboxId={c.chatwoot_inbox_id}
        config={c.meta_templates}
        onSave={(next) => patchCampaign.mutate({ meta_templates: next })}
        saving={patchCampaign.isPending}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card accent="cyan">
          <h3>// Chatwoot — resumo</h3>
          <div className="mt-3 space-y-2 text-[11px]">
            <div>
              <span className="text-muted">Inbox ID:</span>{' '}
              <span className="text-text">{c.chatwoot_inbox_id ?? '—'}</span>
            </div>
            {Object.entries(c.chatwoot_event_config ?? {}).length === 0 && (
              <div className="text-muted-2">— nenhum evento configurado</div>
            )}
            {Object.entries(c.chatwoot_event_config ?? {}).map(([ev, cfg]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>
                <div className="mt-1 text-[11px] text-muted">
                  {(cfg?.labels_add?.length ?? 0) > 0 && <>label+ {cfg!.labels_add.length} </>}
                  {(cfg?.labels_remove?.length ?? 0) > 0 && <>label- {cfg!.labels_remove.length} </>}
                  {(cfg?.skip_if_has_label?.length ?? 0) > 0 && <>skip {cfg!.skip_if_has_label.length} </>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card accent="purple">
          <h3>// Mautic — resumo</h3>
          <div className="mt-3 space-y-2 text-[11px]">
            {Object.entries(c.mautic_event_config ?? {}).length === 0 && (
              <div className="text-muted-2">— nenhum evento configurado</div>
            )}
            {Object.entries(c.mautic_event_config ?? {}).map(([ev, cfg]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>
                <div className="mt-1 text-[11px] text-muted">
                  {(cfg?.segments_add?.length ?? 0) > 0 && <>seg+ [{cfg!.segments_add.join(', ')}] </>}
                  {(cfg?.segments_remove?.length ?? 0) > 0 && <>seg- [{cfg!.segments_remove.join(', ')}] </>}
                  {(cfg?.tags_add?.length ?? 0) > 0 && <>tag+ {cfg!.tags_add.length} </>}
                  {(cfg?.tags_remove?.length ?? 0) > 0 && <>tag- {cfg!.tags_remove.length} </>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card accent="green">
          <h3>// Google Sheets — resumo</h3>
          <div className="mt-3 space-y-1.5 text-[11px]">
            <div>
              <span className="text-muted">Spreadsheet ID:</span>{' '}
              <code className="text-accent-3">{c.sheets_id ?? '—'}</code>
            </div>
            <div>
              <span className="text-muted">Aba:</span>{' '}
              <code className="text-accent-3">{c.sheets_tab ?? '— (default "vendas")'}</code>
            </div>
            <div className="mt-2 text-[10px] text-muted-2">
              32 colunas fixas: ID, Data Criação, Evento, Nome, E-mail, Telefone, Instagram, Cidade,
              Moeda, Valor oferta, ID produto, Transaction, Preço, Order Bump?, Produto, Líquido,
              sck, s=, m=, c=, co=, t=, utm_id=, Campaign Name*, Adset Name*, Ad Name*,
              Moeda Produto, Moeda Original, Moeda recebimento, Preço Original, Tipo Pagamento,
              execution. (*) computado por fórmula na própria planilha.
            </div>
          </div>
        </Card>
        <Card accent="amber">
          <h3>// WhatsApp Templates — resumo</h3>
          <div className="mt-3 space-y-1.5 text-[11px]">
            {Object.entries(c.meta_templates ?? {}).map(([ev, tpl]) => (
              <div key={ev}>
                <code className="text-accent-2">{ev}</code>{' '}
                <span className="text-muted">→</span>{' '}
                <code className="text-accent-4">{tpl?.template_name ?? '—'}</code>
                {tpl && Object.keys(tpl.template_params ?? {}).length > 0 && (
                  <span className="ml-1 text-[10px] text-muted-2">
                    ({Object.keys(tpl.template_params).length} params)
                  </span>
                )}
              </div>
            ))}
            {Object.keys(c.meta_templates ?? {}).length === 0 && (
              <div className="text-muted-2">— nenhum evento configurado</div>
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
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
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

// ─── Mautic Event Editor ─────────────────────────────────────────────────────

function MauticEventEditor({
  mauticInstanceId,
  config,
  onSave,
  saving,
}: {
  mauticInstanceId: string | null;
  config: Partial<Record<EventId, MauticEventConfig>>;
  onSave: (next: Partial<Record<EventId, MauticEventConfig>>) => void;
  saving: boolean;
}) {
  const [selectedEvent, setSelectedEvent] = useState<EventId>(EVENTS[0].id);
  const { draft, setDraft, status } = useAutoSavedEvent<MauticEventConfig>({
    selectedEvent,
    config,
    emptyDraft: emptyMauticEventConfig,
    patch: onSave,
    saving,
  });

  function update<K extends keyof MauticEventConfig>(field: K, value: MauticEventConfig[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  return (
    <Card accent="purple" className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3>// Mautic — config por evento</h3>
          <p className="mt-1.5 text-[11px] text-muted">
            Define o que fazer no Mautic quando esse evento chega. UTMs são enviados automaticamente
            (utmsource, utmmedium, utmcampaign, utmcontent, utmterm). Salva automaticamente.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <SaveStatusBadge status={status} />
          <label className="block min-w-[220px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Evento
            </span>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value as EventId)}
            >
              {EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!mauticInstanceId && (
        <Callout kind="warn">
          Selecione uma instância Mautic acima pra carregar os tags e segmentos disponíveis.
        </Callout>
      )}

      <div className="space-y-4">
        <MauticSegmentPicker
          mauticInstanceId={mauticInstanceId}
          label="Segmentos — adicionar a"
          hint="Onde o contato vai ser inserido quando esse evento chega"
          values={draft.segments_add}
          onChange={(v) => update('segments_add', v)}
        />
        <MauticSegmentPicker
          mauticInstanceId={mauticInstanceId}
          label="Segmentos — remover de"
          hint="Onde o contato vai sair (limpar estados antigos: abandono, ghost, etc.)"
          values={draft.segments_remove}
          onChange={(v) => update('segments_remove', v)}
        />
        <MauticTagPicker
          mauticInstanceId={mauticInstanceId}
          label="Tags — adicionar"
          hint="Tags já cadastradas no Mautic. Templates {{order.product_name}} suportados."
          values={draft.tags_add}
          onChange={(v) => update('tags_add', v)}
        />
        <MauticTagPicker
          mauticInstanceId={mauticInstanceId}
          label="Tags — remover"
          hint="Mautic usa prefixo -tag pra remover; nós formatamos automaticamente"
          values={draft.tags_remove}
          onChange={(v) => update('tags_remove', v)}
        />
        <MauticCustomFieldsEditor
          mauticInstanceId={mauticInstanceId}
          values={draft.custom_fields}
          onChange={(v) => update('custom_fields', v)}
        />
        <MauticTagPicker
          mauticInstanceId={mauticInstanceId}
          label="Skip se contato já tem tag"
          hint="Se o contato já tem qualquer dessas tags, o evento é ignorado (ex: skip abandono se já é comprador)"
          values={draft.skip_if_has_tag}
          onChange={(v) => update('skip_if_has_tag', v)}
        />
      </div>
    </Card>
  );
}

// ─── Mautic discovery pickers ────────────────────────────────────────────────

function useMauticTags(mauticInstanceId: string | null) {
  return useQuery({
    queryKey: ['mautic-discovery', mauticInstanceId, 'tags'],
    enabled: Boolean(mauticInstanceId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: MauticTagOption[] }>(
        `/api/instances/mautic/${mauticInstanceId}/tags`,
      ),
  });
}

function useMauticSegments(mauticInstanceId: string | null) {
  return useQuery({
    queryKey: ['mautic-discovery', mauticInstanceId, 'segments'],
    enabled: Boolean(mauticInstanceId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: MauticSegmentOption[] }>(
        `/api/instances/mautic/${mauticInstanceId}/segments`,
      ),
  });
}

function useMauticContactFields(mauticInstanceId: string | null) {
  return useQuery({
    queryKey: ['mautic-discovery', mauticInstanceId, 'contact-fields'],
    enabled: Boolean(mauticInstanceId),
    staleTime: 30 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: MauticFieldOption[] }>(
        `/api/instances/mautic/${mauticInstanceId}/contact-fields`,
      ),
  });
}

function PickerStatus({
  isLoading,
  isError,
  count,
  onRefetch,
}: {
  isLoading: boolean;
  isError: boolean;
  count: number;
  onRefetch: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefetch}
      className="text-[11px] text-muted-2 hover:text-accent"
      title="atualizar lista do Mautic"
    >
      {isLoading ? '↻ carregando…' : isError ? '✕ falhou — clique pra tentar' : `↻ ${count} itens`}
    </button>
  );
}

function MauticSegmentPicker({
  mauticInstanceId,
  label,
  hint,
  values,
  onChange,
}: {
  mauticInstanceId: string | null;
  label: string;
  hint?: string;
  values: number[];
  onChange: (v: number[]) => void;
}) {
  const q = useMauticSegments(mauticInstanceId);
  const segments = q.data?.items ?? [];
  const byId = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);
  const [selectValue, setSelectValue] = useState('');

  const available = segments.filter((s) => !values.includes(s.id));

  function add(id: number) {
    if (Number.isFinite(id) && !values.includes(id)) onChange([...values, id]);
    setSelectValue('');
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <ChipListHeader label={label} hint={hint} />
        <PickerStatus
          isLoading={q.isLoading}
          isError={q.isError}
          count={segments.length}
          onRefetch={() => q.refetch()}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((id) => (
          <Chip key={id} onRemove={() => onChange(values.filter((x) => x !== id))}>
            {byId.get(id) ?? `#${id}`} <span className="text-accent/60">· {id}</span>
          </Chip>
        ))}
        <select
          value={selectValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) add(v);
          }}
          disabled={!mauticInstanceId || q.isLoading || available.length === 0}
          className="!w-auto !py-1.5 !px-2.5 !text-[12px] min-w-[200px]"
        >
          <option value="">+ adicionar segmento…</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (id: {s.id})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function MauticTagPicker({
  mauticInstanceId,
  label,
  hint,
  values,
  onChange,
}: {
  mauticInstanceId: string | null;
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const q = useMauticTags(mauticInstanceId);
  const tags = q.data?.items ?? [];
  const [selectValue, setSelectValue] = useState('');

  const available = tags.map((t) => t.tag).filter((t) => !values.includes(t));

  function add(tag: string) {
    const v = tag.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setSelectValue('');
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <ChipListHeader label={label} hint={hint} />
        <PickerStatus
          isLoading={q.isLoading}
          isError={q.isError}
          count={tags.length}
          onRefetch={() => q.refetch()}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((t) => (
          <Chip key={t} onRemove={() => onChange(values.filter((x) => x !== t))}>
            {t}
          </Chip>
        ))}
        <select
          value={selectValue}
          onChange={(e) => {
            if (e.target.value) add(e.target.value);
          }}
          disabled={!mauticInstanceId || q.isLoading || available.length === 0}
          className="!w-auto !py-1.5 !px-2.5 !text-[12px] min-w-[260px]"
        >
          <option value="">+ adicionar tag…</option>
          {available.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function MauticCustomFieldsEditor({
  mauticInstanceId,
  values,
  onChange,
}: {
  mauticInstanceId: string | null;
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const q = useMauticContactFields(mauticInstanceId);
  const fields = q.data?.items ?? [];
  const byAlias = useMemo(() => new Map(fields.map((f) => [f.alias, f.label])), [fields]);

  const [selectedAlias, setSelectedAlias] = useState('');
  const [v, setV] = useState('');
  const entries = Object.entries(values);
  const available = fields.filter((f) => !(f.alias in values));

  function add(e: FormEvent) {
    e.preventDefault();
    if (!selectedAlias) return;
    onChange({ ...values, [selectedAlias]: v });
    setSelectedAlias('');
    setV('');
  }
  function remove(alias: string) {
    const next = { ...values };
    delete next[alias];
    onChange(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <ChipListHeader
          label="Custom fields"
          hint="Valores suportam templates: {{order.product_name}}, {{utm.utm_source}}, etc."
        />
        <PickerStatus
          isLoading={q.isLoading}
          isError={q.isError}
          count={fields.length}
          onRefetch={() => q.refetch()}
        />
      </div>
      <div className="mt-1.5 space-y-1.5">
        {entries.map(([alias, val]) => (
          <div
            key={alias}
            className="flex items-center gap-2 rounded-sm border border-border bg-dim px-2.5 py-1.5"
          >
            <code className="text-[11px] text-accent-2" title={byAlias.get(alias) ?? alias}>
              {alias}
            </code>
            <span className="text-muted-2">=</span>
            <code className="flex-1 text-[11px] text-text">{val}</code>
            <button
              type="button"
              onClick={() => remove(alias)}
              className="text-[11px] text-muted hover:text-accent-5"
              aria-label={`remover ${alias}`}
            >
              ✕
            </button>
          </div>
        ))}
        <form onSubmit={add} className="flex flex-wrap items-center gap-1.5">
          <select
            value={selectedAlias}
            onChange={(e) => setSelectedAlias(e.target.value)}
            disabled={!mauticInstanceId || q.isLoading || available.length === 0}
            className="!w-auto !py-1.5 !px-2.5 !text-[12px] min-w-[200px]"
          >
            <option value="">campo Mautic…</option>
            {available.map((f) => (
              <option key={f.alias} value={f.alias}>
                {f.label} ({f.alias})
              </option>
            ))}
          </select>
          <span className="text-muted-2">=</span>
          <input
            type="text"
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder="valor (ex: 3 ou {{order.product_name}})"
            className="!py-1.5 !px-2.5 !text-[12px] flex-1 min-w-[200px]"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={!selectedAlias}>
            +
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChipListHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      {hint && <span className="block text-[11px] text-muted-2">{hint}</span>}
    </div>
  );
}

function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="text-accent/60 hover:text-accent-5"
        aria-label="remover"
      >
        ✕
      </button>
    </span>
  );
}

// ─── WhatsApp template editor (via Chatwoot) ─────────────────────────────────

/** Extracts {{1}}, {{2}}, … placeholders from the template BODY component. */
function extractTemplatePlaceholders(template: ChatwootTemplateOption): string[] {
  const body = template.components.find(
    (c) => c.type === 'BODY' || c.type === 'body',
  );
  if (!body?.text) return [];
  const matches = body.text.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  const keys = new Set<string>();
  for (const m of matches) {
    const k = m.replace(/[{}\s]/g, '');
    keys.add(k);
  }
  return [...keys].sort((a, b) => Number(a) - Number(b));
}

function useChatwootInboxes(chatwootInstanceId: string | null) {
  return useQuery({
    queryKey: ['chatwoot-discovery', chatwootInstanceId, 'inboxes'],
    enabled: Boolean(chatwootInstanceId),
    staleTime: 30 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: ChatwootInboxOption[] }>(
        `/api/instances/chatwoot/${chatwootInstanceId}/inboxes`,
      ),
  });
}

function useChatwootInboxTemplates(
  chatwootInstanceId: string | null,
  inboxId: number | null,
) {
  return useQuery({
    queryKey: ['chatwoot-discovery', chatwootInstanceId, 'templates', inboxId],
    enabled: Boolean(chatwootInstanceId && inboxId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: ChatwootTemplateOption[] }>(
        `/api/instances/chatwoot/${chatwootInstanceId}/inboxes/${inboxId}/templates`,
      ),
  });
}

function MetaTemplatesEditor({
  chatwootInstanceId,
  chatwootInboxId,
  config,
  onSave,
  saving,
}: {
  chatwootInstanceId: string | null;
  chatwootInboxId: number | null;
  config: Partial<Record<EventId, MetaTemplateConfig>>;
  onSave: (next: Partial<Record<EventId, MetaTemplateConfig>>) => void;
  saving: boolean;
}) {
  const [selectedEvent, setSelectedEvent] = useState<EventId>(EVENTS[0].id);
  const { draft, setDraft, status } = useAutoSavedEvent<MetaTemplateConfig>({
    selectedEvent,
    config,
    emptyDraft: emptyMetaTemplateConfig,
    patch: onSave,
    saving,
  });

  const inboxesQuery = useChatwootInboxes(chatwootInstanceId);
  const templatesQuery = useChatwootInboxTemplates(chatwootInstanceId, chatwootInboxId);

  const inbox = (inboxesQuery.data?.items ?? []).find((i) => i.id === chatwootInboxId);
  const templates = templatesQuery.data?.items ?? [];
  const selectedTemplate = templates.find(
    (t) => t.name === draft.template_name && t.language === (draft.language ?? 'pt_BR'),
  );
  const placeholders = selectedTemplate ? extractTemplatePlaceholders(selectedTemplate) : [];

  function updateName(name: string, language: string) {
    setDraft((d) => {
      const isSwitch = name !== d.template_name || language !== (d.language ?? 'pt_BR');
      return {
        template_name: name,
        language,
        template_params: isSwitch ? {} : d.template_params,
      };
    });
  }
  function updateParam(key: string, value: string) {
    setDraft((d) => ({ ...d, template_params: { ...d.template_params, [key]: value } }));
  }
  function clearEvent() {
    setDraft(emptyMetaTemplateConfig());
  }

  return (
    <Card accent="amber" className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3>// WhatsApp templates — config por evento</h3>
          <p className="mt-1.5 text-[11px] text-muted">
            Templates aprovados na inbox WhatsApp do Chatwoot. Envio pela inbox
            <code className="mx-1 text-accent-2">{chatwootInboxId ?? '?'}</code>
            ({inbox?.name ?? 'inbox não selecionada'}). Salva automaticamente.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <SaveStatusBadge status={status} />
          <label className="block min-w-[220px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Evento
            </span>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value as EventId)}
            >
              {EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!chatwootInstanceId && (
        <Callout kind="warn">
          Selecione uma instância Chatwoot acima — o envio de WhatsApp usa a inbox dela.
        </Callout>
      )}
      {chatwootInstanceId && !chatwootInboxId && (
        <Callout kind="warn">
          Defina o "Chatwoot inbox ID" da campanha acima pra carregar os templates dessa inbox.
        </Callout>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <ChipListHeader
              label="Template"
              hint="Templates APPROVED na inbox WhatsApp"
            />
            <PickerStatus
              isLoading={templatesQuery.isLoading}
              isError={templatesQuery.isError}
              count={templates.length}
              onRefetch={() => templatesQuery.refetch()}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              value={
                draft.template_name
                  ? `${draft.template_name}::${draft.language ?? 'pt_BR'}`
                  : ''
              }
              onChange={(e) => {
                if (!e.target.value) {
                  updateName('', 'pt_BR');
                  return;
                }
                const [name, language] = e.target.value.split('::');
                updateName(name, language);
              }}
              disabled={!chatwootInboxId || templatesQuery.isLoading}
              className="!w-auto min-w-[280px]"
            >
              <option value="">— sem template (evento ignorado) —</option>
              {templates.map((t) => (
                <option key={`${t.name}-${t.language}`} value={`${t.name}::${t.language}`}>
                  {t.name} ({t.language}) {t.category ? `· ${t.category}` : ''}
                </option>
              ))}
            </select>
            {draft.template_name && (
              <Button variant="ghost" size="sm" onClick={clearEvent}>
                limpar
              </Button>
            )}
          </div>
        </div>

        {selectedTemplate && (
          <div>
            <ChipListHeader
              label="Preview do corpo"
              hint="Placeholders {{N}} são substituídos pelos params abaixo"
            />
            <pre className="mt-1.5 whitespace-pre-wrap rounded-sm border border-border bg-dim px-3 py-2 text-[12px] text-text">
              {selectedTemplate.components.find((c) => c.type === 'BODY' || c.type === 'body')?.text ?? '(template sem BODY)'}
            </pre>
          </div>
        )}

        {selectedTemplate && placeholders.length > 0 && (
          <div>
            <ChipListHeader
              label="Parâmetros do template"
              hint="Suportam templating: {{contact.first_name}}, {{order.product_name}}, {{utm.utm_source}}, etc."
            />
            <div className="mt-1.5 space-y-1.5">
              {placeholders.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <code className="w-12 shrink-0 text-[12px] text-accent-2">{`{{${key}}}`}</code>
                  <span className="text-muted-2">=</span>
                  <input
                    type="text"
                    value={draft.template_params[key] ?? ''}
                    onChange={(e) => updateParam(key, e.target.value)}
                    placeholder="ex: {{contact.first_name}}"
                    className="!py-1.5 !px-2.5 !text-[12px] flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTemplate && placeholders.length === 0 && (
          <Callout kind="tip">Esse template não tem variáveis — nada pra preencher.</Callout>
        )}

        {draft.template_name && (
          <div className="flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={clearEvent}>
              limpar evento
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Chatwoot per-event editor ────────────────────────────────────────────────

function useChatwootLabels(chatwootInstanceId: string | null) {
  return useQuery({
    queryKey: ['chatwoot-discovery', chatwootInstanceId, 'labels'],
    enabled: Boolean(chatwootInstanceId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: ChatwootLabelOption[] }>(
        `/api/instances/chatwoot/${chatwootInstanceId}/labels`,
      ),
  });
}

function ChatwootLabelPicker({
  chatwootInstanceId,
  label,
  hint,
  values,
  onChange,
}: {
  chatwootInstanceId: string | null;
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const q = useChatwootLabels(chatwootInstanceId);
  const labels = q.data?.items ?? [];
  const [selectValue, setSelectValue] = useState('');
  const available = labels.map((l) => l.title).filter((t) => !values.includes(t));

  function add(title: string) {
    const v = title.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setSelectValue('');
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <ChipListHeader label={label} hint={hint} />
        <PickerStatus
          isLoading={q.isLoading}
          isError={q.isError}
          count={labels.length}
          onRefetch={() => q.refetch()}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((t) => (
          <Chip key={t} onRemove={() => onChange(values.filter((x) => x !== t))}>
            {t}
          </Chip>
        ))}
        <select
          value={selectValue}
          onChange={(e) => {
            if (e.target.value) add(e.target.value);
          }}
          disabled={!chatwootInstanceId || q.isLoading || available.length === 0}
          className="!w-auto !py-1.5 !px-2.5 !text-[12px] min-w-[260px]"
        >
          <option value="">+ adicionar label…</option>
          {available.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ChatwootEventEditor({
  chatwootInstanceId,
  config,
  onSave,
  saving,
}: {
  chatwootInstanceId: string | null;
  config: Partial<Record<EventId, ChatwootEventConfig>>;
  onSave: (next: Partial<Record<EventId, ChatwootEventConfig>>) => void;
  saving: boolean;
}) {
  const [selectedEvent, setSelectedEvent] = useState<EventId>(EVENTS[0].id);
  const { draft, setDraft, status } = useAutoSavedEvent<ChatwootEventConfig>({
    selectedEvent,
    config,
    emptyDraft: emptyChatwootEventConfig,
    patch: onSave,
    saving,
  });

  function update<K extends keyof ChatwootEventConfig>(
    field: K,
    value: ChatwootEventConfig[K],
  ) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  return (
    <Card accent="cyan" className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3>// Chatwoot — config por evento</h3>
          <p className="mt-1.5 text-[11px] text-muted">
            Labels a aplicar / remover do contato. Skip pula o evento se o contato já tem alguma das labels (ex: já é comprador). Salva automaticamente.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <SaveStatusBadge status={status} />
          <label className="block min-w-[220px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Evento
            </span>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value as EventId)}
            >
              {EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!chatwootInstanceId && (
        <Callout kind="warn">
          Selecione uma instância Chatwoot acima pra carregar as labels disponíveis.
        </Callout>
      )}

      <div className="space-y-4">
        <ChatwootLabelPicker
          chatwootInstanceId={chatwootInstanceId}
          label="Labels — adicionar"
          hint="Labels que vão ser anexadas ao contato (merge com as existentes)"
          values={draft.labels_add}
          onChange={(v) => update('labels_add', v)}
        />
        <ChatwootLabelPicker
          chatwootInstanceId={chatwootInstanceId}
          label="Labels — remover"
          hint="Limpar estados antigos (ex: tirar abandono quando virar comprador)"
          values={draft.labels_remove}
          onChange={(v) => update('labels_remove', v)}
        />
        <ChatwootLabelPicker
          chatwootInstanceId={chatwootInstanceId}
          label="Skip se contato já tem label"
          hint="Se o contato já tem qualquer dessas labels, o evento é ignorado"
          values={draft.skip_if_has_label}
          onChange={(v) => update('skip_if_has_label', v)}
        />
      </div>
    </Card>
  );
}

// ─── Sheets picker (spreadsheet id + tab dropdown) ───────────────────────────

function useSheetTabs(spreadsheetId: string | null) {
  return useQuery({
    queryKey: ['sheets-discovery', 'tabs', spreadsheetId],
    enabled: Boolean(spreadsheetId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<{ ok: true; items: SheetTabOption[] }>(
        `/api/sheets/tabs?spreadsheet_id=${encodeURIComponent(spreadsheetId!)}`,
      ),
  });
}

function SheetsPicker({
  sheetsId,
  sheetsTab,
  onChangeId,
  onChangeTab,
}: {
  sheetsId: string | null;
  sheetsTab: string | null;
  onChangeId: (v: string | null) => void;
  onChangeTab: (v: string | null) => void;
}) {
  const q = useSheetTabs(sheetsId);
  const tabs = q.data?.items ?? [];

  return (
    <div className="block sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Google Sheets — Spreadsheet ID
        </span>
        <input
          defaultValue={sheetsId ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== sheetsId) onChangeId(v);
          }}
          placeholder="1a2B3cD4..."
        />
      </label>
      <label className="block">
        <div className="flex items-end justify-between">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Aba (tab)
          </span>
          <PickerStatus
            isLoading={q.isLoading}
            isError={q.isError}
            count={tabs.length}
            onRefetch={() => q.refetch()}
          />
        </div>
        <select
          value={sheetsTab ?? ''}
          onChange={(e) => onChangeTab(e.target.value || null)}
          disabled={!sheetsId || q.isLoading}
        >
          <option value="">— escolha uma aba —</option>
          {tabs.map((t) => (
            <option key={t.id} value={t.title}>
              {t.title}
            </option>
          ))}
          {sheetsTab && !tabs.find((t) => t.title === sheetsTab) && (
            <option value={sheetsTab}>{sheetsTab} (não encontrada)</option>
          )}
        </select>
      </label>
    </div>
  );
}
