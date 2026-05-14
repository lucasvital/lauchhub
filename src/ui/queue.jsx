// ─── Queue / Bull Board page ───

function QueuePage({ jobs, refreshJobs }) {
  useTick(1500);
  const [activeQueue, setActiveQueue] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const QUEUES = window.LH.WORKERS.map(w => ({ ...w }));

  const queueCounts = useMemo(() => {
    const m = { all: jobs.length };
    QUEUES.forEach(q => { m[q.id] = jobs.filter(j => j.worker === q.id).length; });
    return m;
  }, [jobs]);

  const statusCounts = useMemo(() => {
    const m = { all: 0, active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 };
    const scope = activeQueue === 'all' ? jobs : jobs.filter(j => j.worker === activeQueue);
    m.all = scope.length;
    scope.forEach(j => { m[j.status] = (m[j.status] || 0) + 1; });
    return m;
  }, [jobs, activeQueue]);

  const filtered = useMemo(() => {
    return jobs
      .filter(j => activeQueue === 'all' || j.worker === activeQueue)
      .filter(j => statusFilter === 'all' || j.status === statusFilter)
      .slice(0, 100);
  }, [jobs, activeQueue, statusFilter]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <SectionLabel number="03">BullMQ · Redis live</SectionLabel>
          <h1>Filas</h1>
        </div>
        <div className="page-header-actions">
          <span className="badge badge-cyan"><span className="badge-dot" />POLLING 1s</span>
          <button className="btn btn-ghost" onClick={refreshJobs}>
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Queue tabs */}
      <div className="queue-tabs">
        <button
          className={`queue-tab ${activeQueue === 'all' ? 'active' : ''}`}
          onClick={() => setActiveQueue('all')}
        >
          Todas
          <span className="queue-tab-count">{queueCounts.all}</span>
        </button>
        {QUEUES.map(q => {
          const tabColor = q.color === 'green' ? 'qt-green' : q.color === 'cyan' ? 'qt-cyan' : q.color === 'amber' ? 'qt-amber' : '';
          return (
            <button
              key={q.id}
              className={`queue-tab ${tabColor} ${activeQueue === q.id ? 'active' : ''}`}
              onClick={() => setActiveQueue(q.id)}
            >
              <WorkerChip id={q.id} size={14} />
              queue:{q.id}
              <span className="queue-tab-count">{queueCounts[q.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Status filter row */}
      <div className="filter-row mt-24">
        {[
          { id: 'all',       label: 'Todos', color: null,    n: statusCounts.all },
          { id: 'active',    label: 'Active', color: 'c-cyan',  n: statusCounts.active },
          { id: 'waiting',   label: 'Waiting', color: null,   n: statusCounts.waiting },
          { id: 'delayed',   label: 'Delayed', color: 'c-amber',n: statusCounts.delayed },
          { id: 'completed', label: 'Completed', color: 'c-green', n: statusCounts.completed },
          { id: 'failed',    label: 'Failed', color: 'c-red',  n: statusCounts.failed },
        ].map(s => (
          <button
            key={s.id}
            className={`chip ${s.color || ''} ${statusFilter === s.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label} · {s.n}
          </button>
        ))}
        <div className="spacer" />
        <span className="muted2 text-xs" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {filtered.length} jobs visíveis
        </span>
      </div>

      {/* Job list */}
      <Card style={{ padding: 0 }}>
        {/* Header */}
        <div
          className="job-row"
          style={{
            background: 'var(--dim)',
            color: 'var(--muted)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span />
          <span>Job ID</span>
          <span>Evento · Contato</span>
          <span>Campanha</span>
          <span style={{ textAlign: 'right' }}>Duração</span>
          <span style={{ textAlign: 'right' }}>Tentativas</span>
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">∅</div>
            Nenhum job nessa fila ainda.
          </div>
        )}

        {filtered.map(j => (
          <div key={j.id} className="job-row">
            <span className={`job-status-dot js-${j.status}`} title={j.status} />
            <span className="mono cut" style={{ color: 'var(--muted2)' }}>{j.id}</span>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <WorkerChip id={j.worker} />
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>{j.event}</span>
                <StatusBadge status={j.status} />
              </div>
              <div className="cut" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                {j.contact_name} · {j.contact_email}
                {j.error && <span style={{ color: 'var(--accent5)' }}> · {j.error.msg}</span>}
              </div>
            </div>
            <span className="pill" style={{ alignSelf: 'flex-start' }}>{j.campaign_token}</span>
            <span style={{ textAlign: 'right', color: 'var(--muted)' }}>
              {j.duration_ms != null ? `${j.duration_ms}ms` : <span className="muted2">—</span>}
            </span>
            <span style={{ textAlign: 'right', color: j.attempts > 1 ? 'var(--accent4)' : 'var(--muted)' }}>
              {j.attempts}/4
            </span>
          </div>
        ))}
      </Card>

      {/* Retry policy reference */}
      <div className="grid grid-2 mt-24">
        <Card>
          <h3>Política de retry</h3>
          <div className="table-wrap mt-16" style={{ margin: 0 }}>
            <table>
              <thead>
                <tr><th>Tentativa</th><th>Delay</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {window.LH.RETRY_POLICY.map(r => (
                  <tr key={r.attempt}>
                    <td className="td-strong">{r.label}</td>
                    <td><code className="code-inline">{r.delay}</code></td>
                    <td>{r.attempt < 5
                      ? <Badge color="muted">retry automático</Badge>
                      : <Badge color="red" dot>dead letter queue</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card accent="cyan">
          <h3>Health check</h3>
          <div className="stack mt-16">
            {[
              { label: 'Redis · BullMQ', status: 'ok',  hint: 'latência média 2ms · 4 workers conectados' },
              { label: 'Postgres',       status: 'ok',  hint: 'pool 8/10 · queries < 30ms' },
              { label: 'Chatwoot API',   status: 'ok',  hint: 'last 200 OK há 4s' },
              { label: 'Mautic OAuth',   status: 'ok',  hint: 'token renovado há 18min' },
              { label: 'Meta Cloud API', status: 'warn',hint: 'rate limit 38/60 req/min — atenção' },
              { label: 'Google Sheets',  status: 'ok',  hint: 'service account autenticada' },
            ].map(h => (
              <div key={h.label} className="row-between" style={{ paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`status-dot`} style={{
                      background: h.status === 'ok' ? 'var(--accent3)' : 'var(--accent4)',
                      boxShadow: h.status === 'ok' ? '0 0 0 3px rgba(16,185,129,0.15)' : '0 0 0 3px rgba(245,158,11,0.15)',
                    }} />
                    <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{h.label}</span>
                  </div>
                  <div style={{ marginLeft: 16, color: 'var(--muted2)', fontSize: 10, marginTop: 2 }}>{h.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { QueuePage });
