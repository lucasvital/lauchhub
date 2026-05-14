// ─── Dashboard page ───

function Dashboard({ jobs, navigate }) {
  useTick(1500); // refresh timeago / live data
  const [throughput] = useState(() => window.LH.generateThroughput());
  const [timeline, setTimeline] = useState(() => window.LH.generateTimeline(14));
  const newSinceMount = useRef(0);

  // Simulate live event stream: every 4s, pop a new event onto the timeline
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = window.LH.generateTimeline(1)[0];
      fresh.ts = new Date().toISOString();
      fresh.kind = 'new';
      newSinceMount.current += 1;
      setTimeline(prev => [fresh, ...prev.slice(0, 19)].map((it, i) => i === 0 ? it : { ...it, kind: it.kind === 'new' ? 'ok' : it.kind }));
    }, 4200);
    return () => clearInterval(id);
  }, []);

  const total24h    = throughput.reduce((s, p) => s + p.value, 0);
  const totalErrors = throughput.reduce((s, p) => s + p.errors, 0);
  const successRate = total24h > 0 ? (1 - totalErrors / total24h) : 1;

  const byWorker = useMemo(() => {
    const m = { sheets: 0, chatwoot: 0, mautic: 0, meta: 0 };
    jobs.forEach(j => { m[j.worker] = (m[j.worker] || 0) + 1; });
    return m;
  }, [jobs]);

  const activeJobs = jobs.filter(j => j.status === 'active');
  const failedJobs = jobs.filter(j => j.status === 'failed').slice(0, 4);

  // Sparkline series from throughput
  const sparkSeries = throughput.map(t => t.value);

  // Per-campaign 24h
  const perCampaign = window.LH.CAMPAIGNS.filter(c => c.active).map(c => ({
    ...c,
    spark: Array.from({ length: 12 }, () => 30 + window.LH.pickInt(0, 100)),
  }));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <SectionLabel number="01">Visão geral · últimas 24h</SectionLabel>
          <h1>Dashboard</h1>
        </div>
        <div className="page-header-actions">
          <span className="badge badge-green"><span className="badge-dot" />4 WORKERS UP</span>
          <span className="badge badge-cyan"><span className="badge-dot" />REDIS LIVE</span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-4 mb-24">
        <Card accent="purple">
          <div className="card-title">Eventos / 24h</div>
          <div className="metric">{fmtNum(total24h)}</div>
          <div className="metric-row">
            <span className="metric-delta up">↑ 14%</span>
            <span className="metric-sub">vs. ontem</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Sparkline data={sparkSeries} color="var(--accent)" fill="var(--accent-glow)" />
          </div>
        </Card>

        <Card accent="green">
          <div className="card-title">Taxa de sucesso</div>
          <div className="metric">{(successRate * 100).toFixed(1)}<span style={{ fontSize: 18, color: 'var(--muted)' }}>%</span></div>
          <div className="metric-row">
            <span className="metric-delta up">↑ 0.3pp</span>
            <span className="metric-sub">7d médio: 98.4%</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Sparkline
              data={throughput.map(t => Math.max(95, 100 - (t.errors / Math.max(1, t.value)) * 100))}
              color="var(--accent3)"
              fill="rgba(16,185,129,0.10)"
            />
          </div>
        </Card>

        <Card accent="cyan">
          <div className="card-title">Jobs ativos</div>
          <div className="metric">{activeJobs.length}</div>
          <div className="metric-row">
            <span className="metric-sub">latência p95: <strong style={{ color: 'var(--text)' }}>1.2s</strong></span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
            {window.LH.WORKERS.map(w => (
              <div key={w.id} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--muted2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{w.glyph}</div>
                <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>{byWorker[w.id] || 0}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card accent={totalErrors > 0 ? 'red' : 'green'}>
          <div className="card-title">Falhas / 24h</div>
          <div className="metric">{totalErrors}</div>
          <div className="metric-row">
            <span className="metric-delta down">↓ 22%</span>
            <span className="metric-sub">na DLQ: <strong style={{ color: 'var(--text)' }}>7</strong></span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Sparkline
              data={throughput.map(t => t.errors)}
              color="var(--accent5)"
              fill="rgba(239,68,68,0.10)"
            />
          </div>
        </Card>
      </div>

      {/* Throughput bar chart + worker breakdown */}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card>
          <div className="card-head">
            <h2>Throughput por hora</h2>
            <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: 'var(--accent)' }} /> jobs</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: 'var(--accent5)' }} /> erros &gt; 2</span>
            </div>
          </div>
          <BarChart data={throughput} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: 'var(--muted2)', letterSpacing: '0.08em' }}>
            <span>-24H</span>
            <span>-18H</span>
            <span>-12H</span>
            <span>-6H</span>
            <span>AGORA</span>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Por worker</h3>
            <span className="badge badge-muted">{jobs.length}</span>
          </div>
          <div className="stack" style={{ gap: 14, marginTop: 4 }}>
            {window.LH.WORKERS.map(w => {
              const count = byWorker[w.id] || 0;
              const total = Math.max(1, jobs.length);
              const pct = (count / total) * 100;
              const accentVar = `var(--accent${w.color === 'purple' ? '' : w.color === 'cyan' ? '2' : w.color === 'green' ? '3' : '4'})`;
              return (
                <div key={w.id}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <WorkerChip id={w.id} />
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{w.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{count} · {pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--dim)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: accentVar, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Live event stream + recent failures */}
      <div className="grid mt-24" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div className="card-head">
            <h2>Stream ao vivo</h2>
            <span className="row" style={{ gap: 6, color: 'var(--accent3)', fontSize: 10, letterSpacing: '0.1em' }}>
              <span className="status-dot" style={{ width: 6, height: 6, boxShadow: '0 0 0 2px rgba(16,185,129,0.15)' }} />
              LIVE
            </span>
          </div>
          <div className="timeline" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {timeline.map((it, i) => (
              <div key={it.id} className={`tl-item tl-${it.kind === 'err' ? 'err' : it.kind === 'new' ? 'new' : 'ok'}`}>
                <div className="tl-row">
                  <span className="tl-time">{fmtTime(it.ts)}</span>
                  <span className="tl-event">{it.event}</span>
                  <span style={{ color: 'var(--muted2)' }}>·</span>
                  <span style={{ color: 'var(--muted)' }}>{it.campaign}</span>
                </div>
                <div style={{ paddingLeft: 60, color: 'var(--muted2)', fontSize: 10, marginTop: 2 }}>
                  {it.contact}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h2>Campanhas ativas</h2>
            <a href="#/campaigns" onClick={(e) => { e.preventDefault(); navigate('/campaigns'); }} style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ver todas →
            </a>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {perCampaign.map((c, i) => (
              <div
                key={c.id}
                className="row-between"
                style={{
                  padding: '14px 0',
                  borderBottom: i < perCampaign.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/campaigns/${c.id}`)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                    <span className="pill" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', fontSize: 11, padding: '1px 7px', borderRadius: 3, fontWeight: 600 }}>{c.token}</span>
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }} className="cut">{c.name}</div>
                  <div style={{ color: 'var(--muted2)', fontSize: 10, marginTop: 2 }}>{fmtNum(c.stats['24h'])} eventos · {(c.stats.success_rate * 100).toFixed(1)}% sucesso</div>
                </div>
                <div style={{ width: 100, marginLeft: 16, flexShrink: 0 }}>
                  <Sparkline data={c.spark} height={28} color="var(--accent)" fill="var(--accent-glow)" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Failures preview */}
      {failedJobs.length > 0 && (
        <Card accent="red" className="mt-24">
          <div className="card-head">
            <h2>Falhas recentes</h2>
            <a href="#/logs" onClick={(e) => { e.preventDefault(); navigate('/logs'); }} style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ir para DLQ →
            </a>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {failedJobs.map((j, i) => (
              <div key={j.id} className="row-between" style={{ padding: '12px 0', borderBottom: i < failedJobs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <WorkerChip id={j.worker} />
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{j.event}</span>
                    <span style={{ color: 'var(--muted2)' }}>·</span>
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>{j.campaign_token}</span>
                    <Badge color="red">{j.attempts}/4 tentativas</Badge>
                  </div>
                  <div className="cut" style={{ fontSize: 11, color: 'var(--muted)' }}>{j.error?.msg}</div>
                </div>
                <div style={{ color: 'var(--muted2)', fontSize: 10, marginLeft: 16, flexShrink: 0 }}>{timeAgo(j.ts)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

Object.assign(window, { Dashboard });
