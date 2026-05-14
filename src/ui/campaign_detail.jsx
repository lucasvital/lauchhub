// ─── Campaign detail (matrix + config) ───

function CampaignDetail({ id, navigate }) {
  const initial = useMemo(() => window.LH.CAMPAIGNS.find(c => c.id === id), [id]);
  const [campaign, setCampaign] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('routing');
  const toast = useToast();

  if (!campaign) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">404</div>
        Campanha não encontrada.
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/campaigns')}>← Voltar</button>
        </div>
      </div>
    );
  }

  const toggleWorker = (eventId, workerId) => {
    setCampaign(c => {
      const cur = new Set(c.enabled_workers[eventId] || []);
      if (cur.has(workerId)) cur.delete(workerId); else cur.add(workerId);
      return { ...c, enabled_workers: { ...c.enabled_workers, [eventId]: [...cur] } };
    });
    setDirty(true);
  };

  const toggleActive = () => {
    setCampaign(c => ({ ...c, active: !c.active }));
    setDirty(true);
    toast.show({
      kind: campaign.active ? 'info' : 'success',
      title: campaign.active ? 'Campanha pausada' : 'Campanha ativada',
      msg: `${campaign.token} · ${campaign.active ? 'eventos descartados temporariamente' : 'processando webhooks'}`,
    });
  };

  const save = () => {
    setDirty(false);
    toast.show({ kind: 'success', title: 'Configuração salva', msg: 'Workers atualizados para todos os eventos.' });
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <a
              href="#/campaigns"
              onClick={(e) => { e.preventDefault(); navigate('/campaigns'); }}
              style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}
            >
              ← campanhas
            </a>
            <span className="muted2">/</span>
            <span className="pill" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>{campaign.token}</span>
          </div>
          <h1>{campaign.name}</h1>
          <div className="row" style={{ gap: 14, marginTop: 10, color: 'var(--muted)', fontSize: 11 }}>
            <span>{campaign.product_name}</span>
            <span className="muted2">·</span>
            <span>criada em {fmtDate(campaign.created_at)}</span>
            <span className="muted2">·</span>
            <span><strong style={{ color: 'var(--text)' }}>{fmtNum(campaign.stats['24h'])}</strong> eventos em 24h</span>
          </div>
        </div>
        <div className="page-header-actions">
          {dirty && <span className="badge badge-amber"><span className="badge-dot" />ALTERAÇÕES PENDENTES</span>}
          <button className={`btn ${campaign.active ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleActive}>
            {campaign.active ? 'Pausar' : 'Ativar'}
          </button>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>
            Salvar
          </button>
        </div>
      </div>

      <Card>
        <div className="card-head" style={{ marginBottom: 14 }}>
          <h3>Webhook URL</h3>
          <span className="muted text-xs" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>cole no painel da Kiwify</span>
        </div>
        <WebhookUrl token={campaign.token} />
      </Card>

      <div className="row mt-24" style={{ gap: 4, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'routing',  label: 'Roteamento' },
          { id: 'tags',     label: 'Tags & Segmentos' },
          { id: 'templates',label: 'Meta Templates' },
          { id: 'integrations', label: 'Integrações' },
        ].map(t => (
          <button
            key={t.id}
            className={`queue-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      <div className="mt-24">
        {tab === 'routing' && <RoutingMatrix campaign={campaign} onToggle={toggleWorker} />}
        {tab === 'tags' && <TagsConfig campaign={campaign} />}
        {tab === 'templates' && <TemplatesConfig campaign={campaign} />}
        {tab === 'integrations' && <IntegrationsConfig campaign={campaign} />}
      </div>
    </div>
  );
}

// ─── Routing matrix: events × workers ───
function RoutingMatrix({ campaign, onToggle }) {
  const EVENTS = window.LH.EVENTS;
  const WORKERS = window.LH.WORKERS;
  return (
    <>
      <Callout kind="tip">
        Toggle on/off qual worker deve processar cada evento. Salvo aqui, vale só para esta campanha.
      </Callout>

      <div className="matrix">
        <div className="matrix-head">
          <div>Evento</div>
          {WORKERS.map(w => (
            <div key={w.id} className="toggle-cell" style={{ justifyContent: 'center' }}>
              <WorkerChip id={w.id} />
              <span>{w.label}</span>
            </div>
          ))}
        </div>
        {EVENTS.map(ev => {
          const enabled = campaign.enabled_workers[ev.id] || [];
          return (
            <div key={ev.id} className="matrix-row">
              <div>
                <div>
                  <div className="matrix-event">{ev.label}</div>
                  <div className="matrix-event-sub">{ev.sub}</div>
                </div>
              </div>
              {WORKERS.map(w => {
                const on = enabled.includes(w.id);
                const tglColor = w.color === 'green' ? 't-green' : w.color === 'cyan' ? 't-cyan' : w.color === 'amber' ? 't-amber' : '';
                return (
                  <div key={w.id} className="toggle-cell">
                    <input
                      type="checkbox"
                      className={`tgl ${tglColor}`}
                      checked={on}
                      onChange={() => onToggle(ev.id, w.id)}
                      title={`${w.label} - ${on ? 'on' : 'off'}`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Tags + segmentos ───
function TagsConfig({ campaign }) {
  return (
    <div className="grid grid-2">
      <Card accent="cyan">
        <h3>Chatwoot</h3>
        <div className="stack mt-16">
          <label className="field">
            <span className="field-label">Inbox ID</span>
            <input value={campaign.chatwoot_inbox_id || ''} readOnly />
          </label>
          <div>
            <div className="section-label">Tags por evento</div>
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(campaign.chatwoot_tags || {}).map(([event, tags]) => (
                <div key={event} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: 'var(--accent2)', minWidth: 140, paddingTop: 4 }} className="code-inline">{event}</span>
                  <div className="row flex-wrap" style={{ gap: 4, flex: 1 }}>
                    {tags.map(t => <Badge key={t} color="cyan">{t}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card accent="purple">
        <h3>Mautic</h3>
        <div className="stack mt-16">
          <label className="field">
            <span className="field-label">Segment ID</span>
            <input value={campaign.mautic_segment_id || ''} readOnly />
            <span className="field-hint">Todo contato é adicionado a este segmento automaticamente.</span>
          </label>
          <div>
            <div className="section-label">Tags por evento</div>
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(campaign.mautic_tags || {}).map(([event, tags]) => (
                <div key={event} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: 'var(--accent2)', minWidth: 140, paddingTop: 4 }} className="code-inline">{event}</span>
                  <div className="row flex-wrap" style={{ gap: 4, flex: 1 }}>
                    {tags.map(t => <Badge key={t} color="purple">{t}</Badge>)}
                  </div>
                </div>
              ))}
              {Object.keys(campaign.mautic_tags || {}).length === 0 && <span className="muted2 text-xs">— sem tags configuradas</span>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Meta templates ───
function TemplatesConfig({ campaign }) {
  return (
    <Card accent="amber">
      <h3>WhatsApp / Meta Cloud API</h3>
      <p className="muted mt-8 mb-16" style={{ fontSize: 12 }}>
        Template HSM disparado por evento. Use o nome cadastrado no Business Manager.
      </p>

      <div className="table-wrap" style={{ margin: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Template</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {window.LH.EVENTS.map(ev => {
              const template = campaign.meta_templates[ev.id];
              const isEnabled = (campaign.enabled_workers[ev.id] || []).includes('meta');
              return (
                <tr key={ev.id}>
                  <td className="td-strong">
                    <code className="code-inline">{ev.id}</code>
                  </td>
                  <td>
                    {template
                      ? <code className="code-inline" style={{ color: 'var(--accent4)' }}>{template}</code>
                      : <span className="muted2">—</span>}
                  </td>
                  <td>
                    {isEnabled && template
                      ? <Badge color="green" dot>ATIVO</Badge>
                      : <Badge color="muted">OFF</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Integrations summary ───
function IntegrationsConfig({ campaign }) {
  return (
    <div className="grid grid-2">
      <Card accent="green">
        <h3>Google Sheets</h3>
        <div className="mt-16">
          <div className="section-label">Spreadsheet ID</div>
          <div className="webhook-box" style={{ borderStyle: 'solid' }}>
            <code style={{ color: 'var(--accent3)' }}>{campaign.sheets_id || '—'}</code>
            <button className="copy-btn">ABRIR</button>
          </div>
          <Callout kind="info">
            Colunas: <code className="code-inline">timestamp</code> · <code className="code-inline">event</code> · <code className="code-inline">name</code> · <code className="code-inline">email</code> · <code className="code-inline">phone</code> · <code className="code-inline">order_id</code> · <code className="code-inline">payment_method</code> · <code className="code-inline">value</code>
          </Callout>
        </div>
      </Card>

      <Card accent="purple">
        <h3>Identificadores</h3>
        <div className="mt-16 stack">
          <Field label="Campaign ID" value={campaign.id} />
          <Field label="Token" value={campaign.token} />
          <Field label="Product ID Kiwify" value={campaign.product_id || '—'} />
          <Field label="Created at" value={fmtDate(campaign.created_at)} />
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="section-label" style={{ marginBottom: 4 }}>{label}</div>
      <code className="code-inline" style={{ fontSize: 11 }}>{value}</code>
    </div>
  );
}

Object.assign(window, { CampaignDetail });
