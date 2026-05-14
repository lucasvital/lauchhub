// ─── Sidebar ───

function Sidebar({ route, navigate, theme, onThemeToggle, counts }) {
  const items = [
    { id: '/',           label: 'Dashboard',  icon: 'dashboard', match: (r) => r === '/' || r === '' },
    { id: '/campaigns',  label: 'Campanhas',  icon: 'campaigns', count: counts.campaigns, match: (r) => r.startsWith('/campaigns') },
    { id: '/queue',      label: 'Filas',      icon: 'queue',     count: counts.active, accent: true, match: (r) => r.startsWith('/queue') },
    { id: '/logs',       label: 'Logs / DLQ', icon: 'logs',      count: counts.failed, danger: true, match: (r) => r.startsWith('/logs') },
    { id: '/settings',   label: 'Configurações', icon: 'settings', match: (r) => r.startsWith('/settings') },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">L</div>
        <div className="sidebar-brand-name">launch<span className="sidebar-brand-tld">hub</span></div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Operação</div>
        {items.slice(0, 4).map(item => {
          const active = item.match(route);
          return (
            <a
              key={item.id}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); navigate(item.id); }}
              href={`#${item.id}`}
            >
              <span className="nav-item-icon"><Icon name={item.icon} /></span>
              <span>{item.label}</span>
              {item.count != null && item.count > 0 && (
                <span className="nav-item-count">{item.count}</span>
              )}
            </a>
          );
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Sistema</div>
        {items.slice(4).map(item => {
          const active = item.match(route);
          return (
            <a
              key={item.id}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); navigate(item.id); }}
              href={`#${item.id}`}
            >
              <span className="nav-item-icon"><Icon name={item.icon} /></span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>online</span>
          <br />
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--muted2)' }}>
            launches.loyoladigital.com
          </span>
        </span>
        <button
          className="theme-toggle"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
          aria-label="toggle theme"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={12} />
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
