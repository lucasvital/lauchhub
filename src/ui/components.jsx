// ─── Shared components for LaunchHub UI ───
// (loaded via Babel; all components are exported to window at the bottom)

const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ─── Icon (line-style, design-system colors) ───
function Icon({ name, size = 14, color = 'currentColor', strokeWidth = 1.6 }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0, display: 'block' },
  };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>,
    campaigns: <><path d="M3 11l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    queue: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    logs: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>,
    moon: <><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    chevron: <><polyline points="9 18 15 12 9 6"/></>,
    chevronDown: <><polyline points="6 9 12 15 18 9"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>,
    external: <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
}

// ─── Worker glyph chip (S/C/M/W) ───
function WorkerChip({ id, active = true, size = 18 }) {
  const w = window.LH.WORKERS.find(w => w.id === id);
  if (!w) return null;
  return (
    <span
      className={`worker-chip w-${w.id} ${active ? 'active' : ''}`}
      style={{ width: size, height: size }}
      title={`${w.label}${active ? '' : ' (off)'}`}
    >{w.glyph}</span>
  );
}

function WorkerChipRow({ ids = [], all = false }) {
  const workers = window.LH.WORKERS;
  return (
    <div className="worker-chips">
      {workers.map(w => (
        <WorkerChip key={w.id} id={w.id} active={ids.includes(w.id)} />
      ))}
    </div>
  );
}

// ─── Time helpers ───
function timeAgo(iso) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const dd = Math.floor(h / 24);
  return `${dd}d atrás`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 1 : 2).replace('.0','') + 'k';
  return String(n);
}

// ─── Sparkline ───
function Sparkline({ data, height = 40, color = 'var(--accent)', fill = 'var(--accent-glow)' }) {
  if (!data || data.length < 2) return null;
  const w = 200;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3]);
  const pathLine = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const pathFill = `${pathLine} L${w},${h} L0,${h} Z`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={pathFill} fill={fill} />
      <path d={pathLine} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="2.5" fill={color} />
      )}
    </svg>
  );
}

// ─── BarChart (hourly throughput) ───
function BarChart({ data, height = 80, accent = 'var(--accent)' }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map(d => d.value)) || 1;
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div
            key={i}
            className={'bar' + (d.errors > 2 ? ' b-err' : '')}
            style={{ height: `${Math.max(6, pct)}%`, background: d.errors > 2 ? undefined : accent }}
            title={`${d.value} jobs / ${d.errors} erros`}
          />
        );
      })}
    </div>
  );
}

// ─── Card ───
function Card({ accent, children, className = '', tight = false, style }) {
  const cls = ['card'];
  if (accent) cls.push('c-' + accent);
  if (tight) cls.push('card-pad-tight');
  if (className) cls.push(className);
  return <div className={cls.join(' ')} style={style}>{children}</div>;
}

// ─── Badge ───
function Badge({ color = 'purple', dot = false, children }) {
  return (
    <span className={`badge badge-${color}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

// ─── Callout ───
function Callout({ kind = 'info', children }) {
  const icons = { info: '→', tip: '✦', warn: '⚠', danger: '✕' };
  return (
    <div className={`callout callout-${kind}`}>
      <span className="callout-icon">{icons[kind]}</span>
      <div style={{ flex: 1, color: 'var(--text)' }}>{children}</div>
    </div>
  );
}

// ─── Modal ───
function Modal({ open, onClose, title, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Toast context ───
const ToastCtx = createContext(null);
function useToast() { return useContext(ToastCtx); }

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const show = useCallback((opts) => {
    const id = ++idRef.current;
    const toast = { id, kind: 'info', title: '', msg: '', duration: 3200, ...opts };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toast.duration);
  }, []);
  const ctx = useMemo(() => ({ show }), [show]);
  const iconFor = { info: '→', success: '✓', error: '✕' };
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast t-${t.kind}`}>
            <span className="toast-icon">{iconFor[t.kind] || '→'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ─── Copy-to-clipboard webhook box ───
function WebhookUrl({ token }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const url = `https://launches.loyoladigital.com/webhook/${token}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) { /* ignore */ }
    setCopied(true);
    toast.show({ kind: 'success', title: 'URL copiada', msg: 'Cole no painel do Kiwify' });
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="webhook-box">
      <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>POST</span>
      <code>{url}</code>
      <button className="copy-btn" onClick={onCopy}>
        {copied ? '✓ COPIADO' : 'COPIAR'}
      </button>
    </div>
  );
}

// ─── Section header ───
function SectionLabel({ children, number }) {
  return (
    <div className="section-label">{number && <span style={{ color: 'var(--accent)', marginRight: 8 }}>{number}</span>}{children}</div>
  );
}

// ─── Live tick: re-render every N ms so timeago / live data refreshes ───
function useTick(ms = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(t => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ─── Hash router ───
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((to) => { window.location.hash = to; }, []);
  return [hash, navigate];
}

// ─── Status badge (job/job-row) ───
function StatusBadge({ status }) {
  const map = {
    completed: { color: 'green', label: 'COMPLETED' },
    active:    { color: 'cyan',  label: 'ACTIVE' },
    waiting:   { color: 'muted', label: 'WAITING' },
    delayed:   { color: 'amber', label: 'DELAYED' },
    failed:    { color: 'red',   label: 'FAILED' },
  };
  const m = map[status] || map.waiting;
  return <Badge color={m.color} dot>{m.label}</Badge>;
}

// ─── Event label pill ───
function EventLabel({ event }) {
  const e = window.LH.EVENTS.find(x => x.id === event);
  if (!e) return <code className="code-inline">{event}</code>;
  return <span className="code-inline" style={{ color: 'var(--accent2)' }}>{e.id}</span>;
}

Object.assign(window, {
  Icon, WorkerChip, WorkerChipRow,
  timeAgo, fmtTime, fmtDate, fmtNum,
  Sparkline, BarChart,
  Card, Badge, Callout, Modal,
  ToastCtx, useToast, ToastProvider,
  WebhookUrl, SectionLabel, useTick, useHashRoute,
  StatusBadge, EventLabel,
});
