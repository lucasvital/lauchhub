// ─── Campaigns list + new/edit modal ───

function CampaignsList({ navigate }) {
  useTick(2000);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [campaigns, setCampaigns] = useState(() => window.LH.CAMPAIGNS);

  const filtered = useMemo(() => {
    return campaigns.filter(c => {
      if (statusFilter === 'active' && !c.active) return false;
      if (statusFilter === 'paused' && c.active) return false;
      if (query) {
        const q = query.toLowerCase();
        return c.name.toLowerCase().includes(q)
          || c.token.toLowerCase().includes(q)
          || (c.product_name || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [campaigns, query, statusFilter]);

  const counts = {
    all: campaigns.length,
    active: campaigns.filter(c => c.active).length,
    paused: campaigns.filter(c => !c.active).length,
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <SectionLabel number="02">{counts.active} campanhas em produção</SectionLabel>
          <h1>Campanhas</h1>
        </div>
        <div className="page-header-actions">
          <div className="search">
            <span className="search-icon"><Icon name="search" size={12} /></span>
            <input
              placeholder="buscar por nome, token, produto..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={12} /> Nova campanha
          </button>
        </div>
      </div>

      <div className="filter-row">
        <button className={`chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          Todas · {counts.all}
        </button>
        <button className={`chip c-green ${statusFilter === 'active' ? 'active' : ''}`} onClick={() => setStatusFilter('active')}>
          Ativas · {counts.active}
        </button>
        <button className={`chip ${statusFilter === 'paused' ? 'active' : ''}`} onClick={() => setStatusFilter('paused')}>
          Pausadas · {counts.paused}
        </button>
        <div className="spacer" />
        <span className="muted2 text-xs" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Token / Nome</th>
              <th>Produto</th>
              <th>Workers</th>
              <th style={{ textAlign: 'right' }}>24h</th>
              <th style={{ textAlign: 'right' }}>Sucesso</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan="7">
                <div className="empty-state">
                  <div className="empty-state-icon">∅</div>
                  Nenhuma campanha bate com esse filtro
                </div>
              </td></tr>
            )}
            {filtered.map(c => {
              const enabledWorkerSet = new Set();
              Object.values(c.enabled_workers || {}).forEach(arr => arr.forEach(w => enabledWorkerSet.add(w)));
              return (
                <tr key={c.id} className="row-clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                  <td>
                    {c.active
                      ? <Badge color="green" dot>ATIVA</Badge>
                      : <Badge color="muted">PAUSADA</Badge>}
                  </td>
                  <td className="td-strong">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="pill">{c.token}</span>
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 400 }}>{c.name}</div>
                  </td>
                  <td>{c.product_name}</td>
                  <td>
                    <WorkerChipRow ids={[...enabledWorkerSet]} />
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{fmtNum(c.stats['24h'])}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: c.stats.success_rate > 0.97 ? 'var(--accent3)' : 'var(--accent4)' }}>
                      {(c.stats.success_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Icon name="chevron" size={12} color="var(--muted2)" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NewCampaignModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreate={(c) => {
          setCampaigns(prev => [c, ...prev]);
          setShowNew(false);
          navigate(`/campaigns/${c.id}`);
        }}
      />
    </div>
  );
}

// ─── New campaign modal ───
function NewCampaignModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [productId, setProductId] = useState('');
  const [touched, setTouched] = useState({});
  const toast = useToast();

  // Auto-generate token from name
  const suggestedToken = useMemo(() => {
    return name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9\s-]/g,'')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(w => w.slice(0,4))
      .join('-');
  }, [name]);

  useEffect(() => {
    if (!touched.token && suggestedToken) setToken(suggestedToken);
  }, [suggestedToken, touched.token]);

  const errors = {
    name:  !name.trim() ? 'obrigatório' : null,
    token: !token.trim() ? 'obrigatório' : !/^[a-z0-9-]+$/.test(token) ? 'apenas a-z, 0-9 e hífen' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const reset = () => {
    setName(''); setToken(''); setProductId(''); setTouched({});
  };

  const submit = () => {
    setTouched({ name: true, token: true });
    if (hasErrors) return;
    const newCampaign = {
      id: 'new-' + window.LH.shortId(),
      name: name.trim(),
      token: token.trim(),
      product_id: productId.trim() || null,
      product_name: '— novo —',
      sheets_id: null,
      chatwoot_inbox_id: null,
      chatwoot_tags: {},
      mautic_segment_id: null,
      mautic_tags: {},
      meta_templates: {},
      enabled_workers: Object.fromEntries(window.LH.EVENTS.map(e => [e.id, [...e.default]])),
      active: true,
      created_at: new Date().toISOString(),
      stats: { '24h': 0, '7d': 0, '30d': 0, success_rate: 1 },
    };
    onCreate(newCampaign);
    toast.show({ kind: 'success', title: 'Campanha criada', msg: `Webhook pronto para ${newCampaign.token}` });
    reset();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Nova campanha"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { onClose(); reset(); }}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={hasErrors && (touched.name || touched.token)}>
            Criar campanha
          </button>
        </>
      }
    >
      <Callout kind="info">
        Ao criar, geramos o webhook URL automaticamente. Configure os workers e tags na próxima tela.
      </Callout>

      <label className="field">
        <span className="field-label">Nome</span>
        <input
          placeholder="Ex: Desafio Gestão PG02"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(t => ({ ...t, name: true }))}
          className={touched.name && errors.name ? 'has-error' : ''}
        />
        {touched.name && errors.name && <span className="field-error">{errors.name}</span>}
      </label>

      <label className="field">
        <span className="field-label">Token (identifica o webhook)</span>
        <input
          placeholder="dg-pg02"
          value={token}
          onChange={(e) => { setToken(e.target.value); setTouched(t => ({ ...t, token: true })); }}
          onBlur={() => setTouched(t => ({ ...t, token: true }))}
          className={touched.token && errors.token ? 'has-error' : ''}
        />
        {touched.token && errors.token
          ? <span className="field-error">{errors.token}</span>
          : <span className="field-hint">URL final: <code className="code-inline">/webhook/{token || '...'}</code></span>}
      </label>

      <label className="field">
        <span className="field-label">Product ID Kiwify (opcional)</span>
        <input
          placeholder="kw_prod_..."
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        />
        <span className="field-hint">Usado para filtrar eventos quando o webhook é compartilhado entre produtos.</span>
      </label>
    </Modal>
  );
}

Object.assign(window, { CampaignsList, NewCampaignModal });
