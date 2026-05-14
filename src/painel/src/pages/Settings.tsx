import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Button, Callout, SectionLabel, Badge } from '../components/ui';

type Service = 'chatwoot' | 'mautic' | 'meta' | 'sheets';

interface SettingsResponse {
  ok: true;
  settings: Record<string, string | null>;
}

function isMasked(value: string | null | undefined): boolean {
  return !!value && /^\w{4}\*+\w{4}$/.test(value);
}

export function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsResponse>('/api/settings'),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<Service, string | null>>({
    chatwoot: null,
    mautic: null,
    meta: null,
    sheets: null,
  });

  useEffect(() => {
    if (q.data) {
      const initial: Record<string, string> = {};
      for (const [k, v] of Object.entries(q.data.settings)) {
        initial[k] = v ?? '';
      }
      setDraft(initial);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api.patch<SettingsResponse>('/api/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const test = useMutation({
    mutationFn: (service: Service) =>
      api.post<{ ok: boolean; latency_ms: number; error: string | null }>(
        `/api/settings/test/${service}`,
      ),
  });

  function setField(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function onSave() {
    // Don't send masked values back — only fields that were edited (no longer match mask)
    const payload: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (isMasked(v)) continue;
      payload[k] = v === '' ? null : v;
    }
    save.mutate(payload);
  }

  async function onTest(service: Service) {
    setTestStatus((s) => ({ ...s, [service]: 'testing...' }));
    try {
      const r = await test.mutateAsync(service);
      setTestStatus((s) => ({
        ...s,
        [service]: r.ok ? `✓ OK · ${r.latency_ms}ms` : `✕ ${r.error ?? 'falhou'}`,
      }));
    } catch {
      setTestStatus((s) => ({ ...s, [service]: '✕ erro' }));
    }
  }

  function SecretField({
    keyName,
    label,
    hint,
  }: {
    keyName: string;
    label: string;
    hint?: string;
  }) {
    const value = draft[keyName] ?? '';
    const masked = isMasked(value);
    const shown = revealed[keyName] || !masked;
    return (
      <label className="block">
        <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <div className="relative">
          <input
            type={shown ? 'text' : 'password'}
            value={value}
            onChange={(e) => setField(keyName, e.target.value)}
            className="pr-20"
          />
          <button
            type="button"
            onClick={() => {
              if (masked) {
                // Clear masked → user types new
                setField(keyName, '');
                setRevealed((r) => ({ ...r, [keyName]: true }));
              } else {
                setRevealed((r) => ({ ...r, [keyName]: !r[keyName] }));
              }
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm border border-border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-text"
          >
            {masked ? 'TROCAR' : shown ? 'OCULTAR' : 'MOSTRAR'}
          </button>
        </div>
        {hint && <span className="mt-1 block text-[10px] text-muted-2">{hint}</span>}
      </label>
    );
  }

  function PlainField({
    keyName,
    label,
    hint,
    placeholder,
  }: {
    keyName: string;
    label: string;
    hint?: string;
    placeholder?: string;
  }) {
    return (
      <label className="block">
        <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <input
          value={draft[keyName] ?? ''}
          onChange={(e) => setField(keyName, e.target.value)}
          placeholder={placeholder}
        />
        {hint && <span className="mt-1 block text-[10px] text-muted-2">{hint}</span>}
      </label>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="05">Credenciais e endpoints</SectionLabel>
          <h1>Configurações</h1>
        </div>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar todas'}
        </Button>
      </div>

      <Callout kind="warn">
        Alterar URLs ou tokens reinicia os clients dos workers. Faça em janela de baixo tráfego se possível.
      </Callout>

      {save.isSuccess && (
        <div className="mb-4">
          <Badge color="green" dot>
            ✓ SALVO
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card accent="cyan">
          <div className="mb-4 flex items-center justify-between">
            <h3>// Chatwoot</h3>
            <Button variant="ghost" size="sm" onClick={() => onTest('chatwoot')} disabled={test.isPending}>
              testar
            </Button>
          </div>
          <div className="space-y-3">
            <PlainField keyName="chatwoot_url" label="Base URL" placeholder="https://chat.loyoladigital.com" />
            <SecretField keyName="chatwoot_token" label="API Access Token" hint="user-level token, role admin" />
            <PlainField keyName="chatwoot_account_id" label="Account ID" />
          </div>
          {testStatus.chatwoot && (
            <div className="mt-3 text-[11px] text-muted">{testStatus.chatwoot}</div>
          )}
        </Card>

        <Card accent="purple">
          <div className="mb-4 flex items-center justify-between">
            <h3>// Mautic</h3>
            <Button variant="ghost" size="sm" onClick={() => onTest('mautic')} disabled={test.isPending}>
              testar
            </Button>
          </div>
          <div className="space-y-3">
            <PlainField keyName="mautic_url" label="Base URL" placeholder="https://crm.loyoladigital.com" />
            <SecretField keyName="mautic_client_id" label="OAuth2 Client ID" />
            <SecretField keyName="mautic_client_secret" label="OAuth2 Client Secret" hint="rotacione a cada 90 dias" />
          </div>
          {testStatus.mautic && (
            <div className="mt-3 text-[11px] text-muted">{testStatus.mautic}</div>
          )}
        </Card>

        <Card accent="amber">
          <div className="mb-4 flex items-center justify-between">
            <h3>// Meta Cloud API</h3>
            <Button variant="ghost" size="sm" onClick={() => onTest('meta')} disabled={test.isPending}>
              testar
            </Button>
          </div>
          <div className="space-y-3">
            <SecretField keyName="meta_token" label="System User Access Token" hint="permanent token do BM" />
            <PlainField keyName="meta_phone_number_id" label="Phone Number ID" />
            <PlainField keyName="meta_api_version" label="API Version" placeholder="v20.0" />
          </div>
          {testStatus.meta && (
            <div className="mt-3 text-[11px] text-muted">{testStatus.meta}</div>
          )}
        </Card>

        <Card accent="green">
          <div className="mb-4 flex items-center justify-between">
            <h3>// Google Sheets</h3>
            <Button variant="ghost" size="sm" onClick={() => onTest('sheets')} disabled={test.isPending}>
              testar
            </Button>
          </div>
          <div className="space-y-3">
            <PlainField
              keyName="google_service_account_email"
              label="Service Account Email"
              hint="compartilhe cada Sheet da campanha com este email (Editor)"
            />
            <SecretField
              keyName="google_service_account_json"
              label="Service Account JSON"
              hint="cole o JSON completo — armazenado encriptado em prod (futuro)"
            />
          </div>
          {testStatus.sheets && (
            <div className="mt-3 text-[11px] text-muted">{testStatus.sheets}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
