import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Button, Callout, SectionLabel, Badge } from '../components/ui';

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
  const [revealed, setRevealed] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      setDraft({
        google_service_account_email: q.data.settings.google_service_account_email ?? '',
        google_service_account_json: q.data.settings.google_service_account_json ?? '',
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api.patch<SettingsResponse>('/api/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const test = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; error?: string | null }>('/api/settings/test/sheets'),
  });

  async function onSave() {
    const payload: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (isMasked(v)) continue;
      payload[k] = v === '' ? null : v;
    }
    save.mutate(payload);
  }

  async function onTest() {
    setTestStatus('testando...');
    try {
      const r = await test.mutateAsync();
      setTestStatus(r.ok ? '✓ JSON válido' : `✕ ${r.error ?? 'falhou'}`);
    } catch {
      setTestStatus('✕ erro');
    }
  }

  const jsonMasked = isMasked(draft.google_service_account_json);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="05">Config global</SectionLabel>
          <h1>Configurações</h1>
        </div>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Callout kind="info">
        Credenciais de Chatwoot, Mautic e WhatsApp ficam em{' '}
        <Link to="/instances" className="underline">
          Integrações
        </Link>{' '}
        — cada campanha aponta pra uma instância.
      </Callout>

      {save.isSuccess && (
        <div className="mb-4">
          <Badge color="green" dot>
            ✓ SALVO
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card accent="green">
          <div className="mb-4 flex items-center justify-between">
            <h3>// Google Sheets</h3>
            <Button variant="ghost" size="sm" onClick={onTest} disabled={test.isPending}>
              testar
            </Button>
          </div>
          <p className="text-[11px] text-muted">
            Uma service account compartilhada por todas as campanhas. Após cadastrar o JSON,
            compartilhe cada Sheet com o email do service account (permissão Editor).
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                Service Account Email
              </span>
              <input
                value={draft.google_service_account_email ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, google_service_account_email: e.target.value }))
                }
                placeholder="launchhub@loyola-prod.iam.gserviceaccount.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                Service Account JSON
              </span>
              <div className="relative">
                <textarea
                  rows={6}
                  value={draft.google_service_account_json ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, google_service_account_json: e.target.value }))
                  }
                  placeholder={'{\n  "type": "service_account",\n  ...\n}'}
                  style={{ resize: 'vertical', fontFamily: '"JetBrains Mono", monospace' }}
                />
                {jsonMasked && !revealed && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, google_service_account_json: '' }));
                      setRevealed(true);
                    }}
                    className="absolute right-2 top-2 rounded-sm border border-border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-text"
                  >
                    TROCAR
                  </button>
                )}
              </div>
            </label>
          </div>
          {testStatus && <div className="mt-3 text-[11px] text-muted">{testStatus}</div>}
        </Card>

        <Card>
          <h3 className="mb-3">// Admin</h3>
          <p className="text-[11px] text-muted">
            Login do painel é configurado via env <code className="text-accent-2">ADMIN_USER</code> /{' '}
            <code className="text-accent-2">ADMIN_PASSWORD</code> no Coolify. Pra rotacionar a senha,
            atualize a env var e o app reinicia automaticamente.
          </p>
          <div className="mt-4 space-y-2 text-[11px]">
            <div>
              <span className="text-muted">Versão:</span>{' '}
              <span className="text-text">v0.1.0</span>
            </div>
            <div>
              <span className="text-muted">Postgres:</span>{' '}
              <span className="text-text">launchhub@postgres:5432</span>
            </div>
            <div>
              <span className="text-muted">Redis:</span>{' '}
              <span className="text-text">redis:6379</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
