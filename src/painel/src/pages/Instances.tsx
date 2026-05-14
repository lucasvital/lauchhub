import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Button, SectionLabel, Callout } from '../components/ui';

type InstanceKind = 'mautic' | 'chatwoot' | 'meta';

interface MauticInstance {
  id: string;
  name: string;
  url: string;
  client_id: string;
  client_secret: string;
}
interface ChatwootInstance {
  id: string;
  name: string;
  url: string;
  token: string;
  account_id: string;
}
interface MetaInstance {
  id: string;
  name: string;
  token: string;
  phone_number_id: string;
  api_version: string;
}

type AnyInstance = MauticInstance | ChatwootInstance | MetaInstance;

export function InstancesPage() {
  const [tab, setTab] = useState<InstanceKind>('mautic');

  return (
    <div>
      <div className="mb-8">
        <SectionLabel number="06">Credenciais de 3rd-party</SectionLabel>
        <h1>Integrações</h1>
        <p className="mt-3 text-xs text-muted">
          Cadastre cada conta Mautic / Chatwoot / WhatsApp como uma "instância". Depois, em cada campanha,
          você escolhe qual instância usar.
        </p>
      </div>

      <Callout kind="info">
        Cada expert/produto pode ter Mautic e WhatsApp diferentes. Chatwoot é geralmente único, mas
        suporta múltiplas instâncias caso queira separar produtos.
      </Callout>

      <div className="mb-6 mt-6 flex items-center gap-1 border-b border-border">
        {(
          [
            { id: 'mautic' as const, label: 'Mautic', color: 'text-accent' },
            { id: 'chatwoot' as const, label: 'Chatwoot', color: 'text-accent-2' },
            { id: 'meta' as const, label: 'Meta (WhatsApp)', color: 'text-accent-4' },
          ] satisfies { id: InstanceKind; label: string; color: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              tab === t.id
                ? `border-b-2 border-current ${t.color}`
                : 'border-b-2 border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mautic' && <MauticTab />}
      {tab === 'chatwoot' && <ChatwootTab />}
      {tab === 'meta' && <MetaTab />}
    </div>
  );
}

// ─── Mautic ──────────────────────────────────────────────────────────────────

function MauticTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['instances', 'mautic'],
    queryFn: () => api.get<{ ok: true; items: MauticInstance[] }>('/api/instances/mautic'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/instances/mautic/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances', 'mautic'] }),
  });

  const items = q.data?.items ?? [];

  return (
    <InstancesList<MauticInstance>
      kind="mautic"
      accent="purple"
      items={items}
      newForm={<NewMauticForm onCreated={() => qc.invalidateQueries({ queryKey: ['instances', 'mautic'] })} />}
      renderRow={(it) => (
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text">{it.name}</div>
          <div className="mt-1 text-[11px] text-muted">{it.url}</div>
          <div className="mt-1 text-[10px] text-muted-2">client_id: {it.client_id}</div>
        </div>
      )}
      onDelete={(id) => remove.mutate(id)}
      loading={q.isLoading}
    />
  );
}

function NewMauticForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/instances/mautic', { name, url, client_id: clientId, client_secret: clientSecret }),
    onSuccess: () => {
      setName('');
      setUrl('');
      setClientId('');
      setClientSecret('');
      onCreated();
    },
    onError: () => setError('Falha ao criar — verifique os campos'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !url.trim() || !clientId.trim() || !clientSecret.trim()) return;
    create.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField label="Nome" value={name} onChange={setName} placeholder="ex: Mautic Expert João" />
      <FormField label="URL" value={url} onChange={setUrl} placeholder="https://crm.expert.com" />
      <FormField label="OAuth2 Client ID" value={clientId} onChange={setClientId} />
      <FormField label="OAuth2 Client Secret" value={clientSecret} onChange={setClientSecret} type="password" />
      {error && <div className="text-[11px] text-accent-5">{error}</div>}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Criando...' : '+ Adicionar instância'}
      </Button>
    </form>
  );
}

// ─── Chatwoot ────────────────────────────────────────────────────────────────

function ChatwootTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['instances', 'chatwoot'],
    queryFn: () => api.get<{ ok: true; items: ChatwootInstance[] }>('/api/instances/chatwoot'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/instances/chatwoot/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances', 'chatwoot'] }),
  });
  const items = q.data?.items ?? [];

  return (
    <InstancesList<ChatwootInstance>
      kind="chatwoot"
      accent="cyan"
      items={items}
      newForm={
        <NewChatwootForm onCreated={() => qc.invalidateQueries({ queryKey: ['instances', 'chatwoot'] })} />
      }
      renderRow={(it) => (
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text">{it.name}</div>
          <div className="mt-1 text-[11px] text-muted">{it.url}</div>
          <div className="mt-1 text-[10px] text-muted-2">account_id: {it.account_id}</div>
        </div>
      )}
      onDelete={(id) => remove.mutate(id)}
      loading={q.isLoading}
    />
  );
}

function NewChatwootForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [accountId, setAccountId] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/instances/chatwoot', { name, url, token, account_id: accountId }),
    onSuccess: () => {
      setName('');
      setUrl('');
      setToken('');
      setAccountId('1');
      onCreated();
    },
    onError: () => setError('Falha ao criar — verifique os campos'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !url.trim() || !token.trim() || !accountId.trim()) return;
    create.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField label="Nome" value={name} onChange={setName} placeholder="ex: Chatwoot Loyola" />
      <FormField label="URL" value={url} onChange={setUrl} placeholder="https://chat.loyoladigital.com" />
      <FormField label="API Access Token" value={token} onChange={setToken} type="password" />
      <FormField label="Account ID" value={accountId} onChange={setAccountId} />
      {error && <div className="text-[11px] text-accent-5">{error}</div>}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Criando...' : '+ Adicionar instância'}
      </Button>
    </form>
  );
}

// ─── Meta ────────────────────────────────────────────────────────────────────

function MetaTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['instances', 'meta'],
    queryFn: () => api.get<{ ok: true; items: MetaInstance[] }>('/api/instances/meta'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/instances/meta/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances', 'meta'] }),
  });
  const items = q.data?.items ?? [];

  return (
    <InstancesList<MetaInstance>
      kind="meta"
      accent="amber"
      items={items}
      newForm={<NewMetaForm onCreated={() => qc.invalidateQueries({ queryKey: ['instances', 'meta'] })} />}
      renderRow={(it) => (
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text">{it.name}</div>
          <div className="mt-1 text-[11px] text-muted">phone_number_id: {it.phone_number_id}</div>
          <div className="mt-1 text-[10px] text-muted-2">api: {it.api_version}</div>
        </div>
      )}
      onDelete={(id) => remove.mutate(id)}
      loading={q.isLoading}
    />
  );
}

function NewMetaForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [apiVersion, setApiVersion] = useState('v20.0');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/instances/meta', {
        name,
        token,
        phone_number_id: phoneNumberId,
        api_version: apiVersion,
      }),
    onSuccess: () => {
      setName('');
      setToken('');
      setPhoneNumberId('');
      setApiVersion('v20.0');
      onCreated();
    },
    onError: () => setError('Falha ao criar — verifique os campos'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !token.trim() || !phoneNumberId.trim()) return;
    create.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField label="Nome" value={name} onChange={setName} placeholder="ex: WhatsApp Expert João" />
      <FormField label="System User Access Token" value={token} onChange={setToken} type="password" />
      <FormField label="Phone Number ID" value={phoneNumberId} onChange={setPhoneNumberId} />
      <FormField label="API Version" value={apiVersion} onChange={setApiVersion} />
      {error && <div className="text-[11px] text-accent-5">{error}</div>}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Criando...' : '+ Adicionar instância'}
      </Button>
    </form>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function InstancesList<T extends AnyInstance>({
  kind,
  items,
  newForm,
  renderRow,
  onDelete,
  accent,
  loading,
}: {
  kind: InstanceKind;
  items: T[];
  newForm: ReactNode;
  renderRow: (item: T) => ReactNode;
  onDelete: (id: string) => void;
  accent: 'purple' | 'cyan' | 'amber';
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {loading ? (
          <div className="text-xs text-muted">carregando...</div>
        ) : items.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-xs text-muted">
              Nenhuma instância cadastrada. Use o form ao lado para começar.
            </div>
          </Card>
        ) : (
          items.map((it) => (
            <InstanceCard
              key={it.id}
              kind={kind}
              accent={accent}
              instance={it}
              renderRow={renderRow}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
      <Card accent={accent}>
        <h3 className="mb-4">// Nova instância</h3>
        {newForm}
      </Card>
    </div>
  );
}

function InstanceCard<T extends AnyInstance>({
  kind,
  accent,
  instance,
  renderRow,
  onDelete,
}: {
  kind: InstanceKind;
  accent: 'purple' | 'cyan' | 'amber';
  instance: T;
  renderRow: (item: T) => ReactNode;
  onDelete: (id: string) => void;
}) {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function onTest() {
    setTesting(true);
    setTestResult('testando...');
    try {
      const r = await api.post<{ ok: boolean; latency_ms?: number; error?: string | null }>(
        `/api/instances/${kind}/${instance.id}/test`,
      );
      setTestResult(r.ok ? `✓ OK · ${r.latency_ms ?? 0}ms` : `✕ ${r.error ?? 'falhou'}`);
    } catch {
      setTestResult('✕ erro de rede');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card accent={accent} tight>
      <div className="flex items-start justify-between gap-3">
        {renderRow(instance)}
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="ghost" onClick={onTest} disabled={testing}>
            testar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (
                confirm(
                  'Excluir esta instância? Campanhas que apontavam pra ela ficarão sem credenciais.',
                )
              ) {
                onDelete(instance.id);
              }
            }}
          >
            Excluir
          </Button>
        </div>
      </div>
      {testResult && <div className="mt-2 text-[11px] text-muted">{testResult}</div>}
    </Card>
  );
}
