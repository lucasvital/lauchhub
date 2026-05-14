// ─── Settings (global config) ───

function SettingsPage() {
  const [config, setConfig] = useState(() => ({ ...window.LH.GLOBAL_CONFIG }));
  const [showSecrets, setShowSecrets] = useState({});
  const [savedAt, setSavedAt] = useState(null);
  const toast = useToast();

  const update = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  const save = () => {
    setSavedAt(new Date());
    toast.show({ kind: 'success', title: 'Config salva', msg: 'Workers reinicializam automaticamente em ~5s' });
  };

  const testConnection = (service) => {
    toast.show({ kind: 'info', title: `Testando ${service}...`, msg: 'Aguardando resposta da API' });
    setTimeout(() => {
      toast.show({ kind: 'success', title: `${service}: OK`, msg: '200 OK · auth válida · ~140ms' });
    }, 1100);
  };

  const SecretInput = ({ k, label, hint, service }) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          type={showSecrets[k] ? 'text' : 'password'}
          value={config[k]}
          onChange={(e) => update(k, e.target.value)}
          style={{ paddingRight: 70 }}
        />
        <button
          type="button"
          onClick={() => setShowSecrets(s => ({ ...s, [k]: !s[k] }))}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
            fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
          }}
        >{showSecrets[k] ? 'OCULTAR' : 'MOSTRAR'}</button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <SectionLabel number="05">Credenciais globais e endpoints</SectionLabel>
          <h1>Configurações</h1>
        </div>
        <div className="page-header-actions">
          {savedAt && (
            <span className="badge badge-green" title={savedAt.toLocaleString('pt-BR')}>
              <span className="badge-dot" />SALVO ÀS {savedAt.toLocaleTimeString('pt-BR').slice(0,5)}
            </span>
          )}
          <button className="btn btn-primary" onClick={save}>Salvar todas</button>
        </div>
      </div>

      <Callout kind="warn">
        Mudar URLs de serviços faz todos os workers re-conectarem. Faça em janela de baixo tráfego se possível.
      </Callout>

      <div className="grid grid-2 mt-24">
        <Card accent="cyan">
          <div className="card-head">
            <h3>Chatwoot (self-hosted)</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection('Chatwoot')}>
              <Icon name="zap" size={10} /> testar
            </button>
          </div>
          <div className="mt-16">
            <label className="field">
              <span className="field-label">Base URL</span>
              <input value={config.chatwoot_url} onChange={(e) => update('chatwoot_url', e.target.value)} />
            </label>
            <SecretInput k="chatwoot_token" label="API Access Token" hint="user-level token, role admin para criar contatos e labels" />
            <label className="field">
              <span className="field-label">Account ID</span>
              <input value={config.chatwoot_account_id} onChange={(e) => update('chatwoot_account_id', e.target.value)} />
            </label>
          </div>
        </Card>

        <Card accent="purple">
          <div className="card-head">
            <h3>Mautic (self-hosted)</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection('Mautic')}>
              <Icon name="zap" size={10} /> testar
            </button>
          </div>
          <div className="mt-16">
            <label className="field">
              <span className="field-label">Base URL</span>
              <input value={config.mautic_url} onChange={(e) => update('mautic_url', e.target.value)} placeholder="https://crm.loyoladigital.com" />
            </label>
            <SecretInput k="mautic_client_id" label="OAuth2 Client ID" />
            <SecretInput k="mautic_client_secret" label="OAuth2 Client Secret" hint="rotacionado automaticamente a cada 90 dias" />
          </div>
        </Card>

        <Card accent="amber">
          <div className="card-head">
            <h3>Meta Cloud API</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection('Meta')}>
              <Icon name="zap" size={10} /> testar
            </button>
          </div>
          <div className="mt-16">
            <SecretInput k="meta_token" label="System User Access Token" hint="permanent token do Business Manager" />
            <label className="field">
              <span className="field-label">Phone Number ID</span>
              <input value={config.meta_phone_number_id} onChange={(e) => update('meta_phone_number_id', e.target.value)} />
            </label>
            <Callout kind="info">Limite atual: <strong style={{ color: 'var(--text)' }}>60 req/min</strong> · upgrade tier disponível no painel da Meta.</Callout>
          </div>
        </Card>

        <Card accent="green">
          <div className="card-head">
            <h3>Google Sheets</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection('Google Sheets')}>
              <Icon name="zap" size={10} /> testar
            </button>
          </div>
          <div className="mt-16">
            <label className="field">
              <span className="field-label">Service Account Email</span>
              <input value={config.google_service_account} onChange={(e) => update('google_service_account', e.target.value)} />
              <span className="field-hint">Compartilhe cada Sheet das campanhas com este email (permissão Editor).</span>
            </label>
            <label className="field">
              <span className="field-label">Service Account JSON</span>
              <textarea
                rows="4"
                placeholder={'{\n  "type": "service_account",\n  "project_id": "loyola-prod",\n  ...\n}'}
                style={{ resize: 'vertical', fontFamily: 'JetBrains Mono, monospace' }}
                defaultValue=""
              />
              <span className="field-hint">Cole o conteúdo completo do arquivo JSON. Armazenado encriptado.</span>
            </label>
          </div>
        </Card>
      </div>

      <div className="grid mt-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card>
          <h3>Conexões internas</h3>
          <div className="stack mt-16">
            <Field label="Postgres" value="postgresql://launchhub@postgres:5432/launchhub" />
            <Field label="Redis" value="redis://redis:6379" />
            <Field label="Domínio público" value="launches.loyoladigital.com" />
            <Field label="Versão" value="v0.4.2 — build #218" />
          </div>
        </Card>

        <Card accent="purple">
          <h3>Admin</h3>
          <div className="mt-16">
            <label className="field">
              <span className="field-label">Usuário</span>
              <input defaultValue="lucas" />
            </label>
            <label className="field">
              <span className="field-label">Nova senha</span>
              <input type="password" placeholder="••••••••••••" />
              <span className="field-hint">Use Bitwarden / 1Password. Mínimo 16 caracteres.</span>
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsPage });
