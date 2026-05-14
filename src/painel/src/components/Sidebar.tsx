import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  match: (path: string) => boolean;
}

const items: NavItem[] = [
  { to: '/', label: 'Dashboard', match: (p) => p === '/' },
  { to: '/campaigns', label: 'Campanhas', match: (p) => p.startsWith('/campaigns') },
  { to: '/logs', label: 'Logs / DLQ', match: (p) => p.startsWith('/logs') },
  { to: '/settings', label: 'Configurações', match: (p) => p.startsWith('/settings') },
];

export function Sidebar({
  theme,
  onThemeToggle,
  onLogout,
}: {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <aside className="sticky top-0 flex h-screen w-[260px] flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-surface py-6">
      <div className="mb-5 flex items-center gap-2.5 border-b border-border px-5 pb-6">
        <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-accent font-display text-sm font-extrabold text-white">
          L
        </div>
        <div className="font-display text-base font-extrabold tracking-tightest">
          launch<span className="text-accent">hub</span>
        </div>
      </div>

      <div className="mb-4 px-3.5">
        <div className="px-2 pb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-2">
          Operação
        </div>
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-border hover:text-text'
              }`}
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-5 pt-4 text-[11px] text-muted">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-3 shadow-[0_0_0_3px_rgba(16,185,129,0.15)] animate-pulse" />
        <span className="flex-1">
          <span className="block font-semibold text-text">online</span>
          <span className="block text-[9px] tracking-[0.08em] text-muted-2">launches.loyoladigital.com</span>
        </span>
        <button
          onClick={onThemeToggle}
          title="toggle theme"
          className="grid h-6 w-6 place-items-center rounded border border-border text-muted transition-colors hover:border-border-2 hover:text-text"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button
          onClick={onLogout}
          title="logout"
          className="grid h-6 w-6 place-items-center rounded border border-border text-muted transition-colors hover:border-accent-5 hover:text-accent-5"
        >
          ⎋
        </button>
      </div>
    </aside>
  );
}
