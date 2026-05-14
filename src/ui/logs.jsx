// ─── Logs / DLQ page ───

function LogsPage() {
  useTick(2000);
  const [tab, setTab] = useState('dlq');
  const [dlq, setDlq] = useState(() => window.LH.generateDlq(11));
  const [unmatched, setUnmatched] = useState(() => window.LH.generateUnmatched(7));
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [retrying, setRetrying] = useState(new Set());
  const toast = useToast();

  const filteredDlq = useMemo(() => {
    if (!query) return dlq;
    const q = query.toLowerCase();
    return dlq.filter(d =>
      d.campaign_token.toLowerCase().includes(q)
      || d.event.toLowerCase().includes(q)
      || d.error_code.toLowerCase().includes(q)
      || d.contact_email.toLowerCase().includes(q)
    );
  }, [dlq, query]);

  const retryJob = (jobId) => {
    setRetrying(s => new Set([...s, jobId]));
    setTimeout(() => {
      setDlq(prev => prev.filter(d => d.id !== jobId));
      setRetrying(s => { const n = new Set(s); n.delete(jobId); return n; });
      toast.show({
        kind: 'success',
        title: 'Job reenfileirado',
        msg: `Job ${jobId} voltou para a fila com prioridade alta`,
      });
    }, 900);
  };

  const retryAll = () => {
    if (dlq.length === 0) return;
    toast.show({
      kind: 'info',
      title: `Reprocessando ${dlq.length} jobs`,
      msg: 'Spread entre todas as filas para evitar rate limit',
    });
    setTimeout(() => {
      setDlq([]);
      toast.show({ kind: 'success', title: 'DLQ esvaziada', msg: 'Todos os jobs foram reenfileirados' });
    }, 1400);
  };

  const discardUnmatched = (id) => {
    setUnmatched(prev => prev.filter(u => u.id !== id));
    toast.show({ kind: 'info', title: 'Evento descartado', msg: 'Removido do log de não-mapeados' });
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <SectionLabel number="04">Falhas terminais e eventos não-mapeados</SectionLabel>
          <h1>Logs &amp; DLQ</h1>
        </div>
        <div className="page-header-actions">
          {tab === 'dlq' && dlq.length > 0 && (
            <button className="btn btn-primary" onClick={retryAll}>
              <Icon name="refresh" size={12} /> Reprocessar todos ({dlq.length})
            </button>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 4, borderBottom: '1px solid var(--border)' }}>
        <button
          className={`queue-tab ${tab === 'dlq' ? 'active' : ''}`}
          onClick={() => setTab('dlq')}
          style={{ borderBottomColor: tab === 'dlq' ? 'var(--accent5)' : 'transparent', color: tab === 'dlq' ? 'var(--accent5)' : undefined }}
        >
          <Icon name="alert" size={12} /> Dead letter queue
          <span className="queue-tab-count">{dlq.length}</span>
        </button>
        <button
          className={`queue-tab ${tab === 'unmatched' ? 'active' : ''}`}
          onClick={() => setTab('unmatched')}
        >
          <Icon name="inbox" size={12} /> Eventos não-mapeados
          <span className="queue-tab-count">{unmatched.length}</span>
        </button>
      </div>

      <div className="filter-row mt-24">
        <div className="search">
          <span className="search-icon"><Icon name="search" size={12} /></span>
          <input
            placeholder={tab === 'dlq' ? 'buscar por token, evento, erro...' : 'buscar por token recebido...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {tab === 'dlq' && (
        <DlqList
          items={filteredDlq}
          expanded={expanded}
          setExpanded={setExpanded}
          retrying={retrying}
          onRetry={retryJob}
        />
      )}

      {tab === 'unmatched' && (
        <UnmatchedList items={unmatched} onDiscard={discardUnmatched} />
      )}
    </div>
  );
}

// ─── DLQ list ───
function DlqList({ items, expanded, setExpanded, retrying, onRetry }) {
  if (items.length === 0) {
    return (
      <Card>
        <div className="empty-state">
          <div className="empty-state-icon" style={{ color: 'var(--accent3)' }}>✓</div>
          DLQ vazia — nenhum job falhou após todos os retries.
        </div>
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.map(d => {
        const isOpen = expanded === d.id;
        const isRetrying = retrying.has(d.id);
        return (
          <Card key={d.id} accent="red" tight>
            <div className="row-between">
              <div className="row" style={{ gap: 10, minWidth: 0, flex: 1 }}>
                <WorkerChip id={d.worker} size={20} />
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>{d.event}</span>
                    <span className="pill">{d.campaign_token}</span>
                    <Badge color="red">4/4 TENTATIVAS</Badge>
                  </div>
                  <div className="cut" style={{ fontSize: 11, color: 'var(--accent5)' }}>
                    <code className="code-inline" style={{ color: 'var(--accent5)' }}>{d.error_code}</code>
                    <span style={{ marginLeft: 8 }}>{d.error_msg}</span>
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                <span style={{ color: 'var(--muted2)', fontSize: 10 }}>{timeAgo(d.failed_at)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                >
                  <Icon name={isOpen ? 'chevronDown' : 'chevron'} size={10} /> {isOpen ? 'Fechar' : 'Detalhes'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={isRetrying}
                  onClick={() => onRetry(d.id)}
                >
                  {isRetrying ? '...' : 'Reprocessar'}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="mt-16" style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="grid grid-2">
                  <div>
                    <div className="section-label">Contato</div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{d.contact_name}</div>
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>{d.contact_email}</div>
                    </div>
                  </div>
                  <div>
                    <div className="section-label">Campanha</div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{d.campaign_name}</div>
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>token: {d.campaign_token}</div>
                    </div>
                  </div>
                </div>

                <div className="section-label mt-16">Histórico</div>
                <div className="timeline">
                  <div className="tl-item tl-err">
                    <div className="tl-row"><span className="tl-time">T+30min</span><span className="tl-event">Tentativa 4 — falha terminal</span></div>
                    <div style={{ paddingLeft: 60, color: 'var(--muted2)', fontSize: 10 }}>{d.error_msg}</div>
                  </div>
                  <div className="tl-item tl-err">
                    <div className="tl-row"><span className="tl-time">T+5min</span><span className="tl-event">Tentativa 3</span></div>
                  </div>
                  <div className="tl-item tl-err">
                    <div className="tl-row"><span className="tl-time">T+30s</span><span className="tl-event">Tentativa 2</span></div>
                  </div>
                  <div className="tl-item tl-err">
                    <div className="tl-row"><span className="tl-time">T+0</span><span className="tl-event">Tentativa 1 — webhook recebido</span></div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Unmatched events ───
function UnmatchedList({ items, onDiscard }) {
  if (items.length === 0) {
    return (
      <Card>
        <div className="empty-state">
          <div className="empty-state-icon" style={{ color: 'var(--accent3)' }}>✓</div>
          Nada por aqui — todos os webhooks bateram com uma campanha cadastrada.
        </div>
      </Card>
    );
  }
  return (
    <>
      <Callout kind="warn">
        Eventos chegando em tokens não cadastrados. O gateway sempre responde 200 ao Kiwify, mas o payload fica aqui para você criar a campanha ou descartar.
      </Callout>

      <div className="stack" style={{ gap: 12 }}>
        {items.map(u => (
          <Card key={u.id} accent="amber" tight>
            <div className="row-between mb-8">
              <div className="row" style={{ gap: 10 }}>
                <Icon name="inbox" size={14} color="var(--accent4)" />
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>
                  token recebido: <code className="code-inline" style={{ color: 'var(--accent4)' }}>{u.token}</code>
                </span>
                <Badge color="amber">SEM CAMPANHA</Badge>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ color: 'var(--muted2)', fontSize: 10 }}>{timeAgo(u.received_at)}</span>
                <button className="btn btn-ghost btn-sm">Criar campanha →</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDiscard(u.id)}>
                  <Icon name="trash" size={10} /> Descartar
                </button>
              </div>
            </div>
            <pre data-lang="json" style={{ margin: 0, fontSize: 11 }}>
{`{
  `}<span className="key">"order_id"</span>{`: `}<span className="str">"{u.payload.order_id}"</span>{`,
  `}<span className="key">"order_status"</span>{`: `}<span className="str">"{u.payload.order_status}"</span>{`,
  `}<span className="key">"Customer"</span>{`: {
    `}<span className="key">"name"</span>{`: `}<span className="str">"{u.payload.Customer.name}"</span>{`,
    `}<span className="key">"email"</span>{`: `}<span className="str">"{u.payload.Customer.email}"</span>{`,
    `}<span className="key">"mobile"</span>{`: `}<span className="str">"{u.payload.Customer.mobile}"</span>{`
  }
}`}
            </pre>
          </Card>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { LogsPage });
