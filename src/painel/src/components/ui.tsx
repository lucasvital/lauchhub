import type { ReactNode } from 'react';

type AccentColor = 'purple' | 'cyan' | 'green' | 'amber' | 'red';

const borderAccents: Record<AccentColor, string> = {
  purple: 'border-l-[3px] border-l-accent',
  cyan: 'border-l-[3px] border-l-accent-2',
  green: 'border-l-[3px] border-l-accent-3',
  amber: 'border-l-[3px] border-l-accent-4',
  red: 'border-l-[3px] border-l-accent-5',
};

export function Card({
  accent,
  children,
  tight = false,
  className = '',
}: {
  accent?: AccentColor;
  children: ReactNode;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-border rounded-md ${tight ? 'p-3.5' : 'p-5'} transition-colors hover:border-border-2 ${accent ? borderAccents[accent] : ''} ${className}`}
    >
      {children}
    </div>
  );
}

const badgeBg: Record<AccentColor | 'muted', string> = {
  purple: 'bg-accent/15 text-accent',
  cyan: 'bg-accent-2/15 text-accent-2',
  green: 'bg-accent-3/15 text-accent-3',
  amber: 'bg-accent-4/15 text-accent-4',
  red: 'bg-accent-5/15 text-accent-5',
  muted: 'bg-dim text-muted',
};

export function Badge({
  color = 'purple',
  dot = false,
  children,
}: {
  color?: AccentColor | 'muted';
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] ${badgeBg[color]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const calloutStyles: Record<'info' | 'tip' | 'warn' | 'danger', string> = {
  info: 'bg-accent-2/[0.07] border-accent-2/25 text-accent-2',
  tip: 'bg-accent-3/[0.07] border-accent-3/25 text-accent-3',
  warn: 'bg-accent-4/[0.07] border-accent-4/25 text-[#d4a017]',
  danger: 'bg-accent-5/[0.07] border-accent-5/25 text-accent-5',
};

export function Callout({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'tip' | 'warn' | 'danger';
  children: ReactNode;
}) {
  const icons = { info: '→', tip: '✦', warn: '⚠', danger: '✕' };
  return (
    <div className={`my-4 flex items-start gap-3 rounded-md border px-4 py-3.5 text-xs leading-relaxed ${calloutStyles[kind]}`}>
      <span className="font-mono text-sm leading-none pt-0.5">{icons[kind]}</span>
      <div className="flex-1 text-text">{children}</div>
    </div>
  );
}

const workerBg: Record<string, string> = {
  sheets: 'bg-accent-3',
  chatwoot: 'bg-accent-2',
  mautic: 'bg-accent',
  meta: 'bg-accent-4',
};

export function WorkerChip({
  workerId,
  active = true,
  size = 24,
  glyph,
}: {
  workerId: string;
  active?: boolean;
  size?: number;
  glyph: string;
}) {
  // Glyph font scales with chip size — keeps the single letter readable
  // whether the consumer uses 18px (toggle matrix) or 32px+ (DLQ rows).
  const fontSize = Math.max(10, Math.round(size * 0.55));
  return (
    <span
      style={{ width: size, height: size, fontSize: `${fontSize}px` }}
      className={`inline-grid place-items-center rounded font-display font-extrabold text-white tracking-tightest transition-opacity ${active ? 'opacity-100' : 'opacity-40 bg-border'} ${active ? workerBg[workerId] ?? 'bg-border' : ''}`}
    >
      {glyph}
    </span>
  );
}

export function SectionLabel({
  number,
  children,
}: {
  number?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 border-border pl-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-3">
      {number && <span className="text-accent mr-2">{number}</span>}
      {children}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  type = 'button',
  onClick,
  className = '',
}: {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
}) {
  const base =
    'font-mono font-semibold uppercase tracking-[0.08em] rounded inline-flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-[12px]', md: 'px-4 py-2 text-[13px]' };
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    ghost: 'bg-transparent text-muted border border-border hover:text-text hover:border-border-2',
    danger: 'bg-transparent text-accent-5 border border-accent-5/30 hover:bg-accent-5/15 hover:border-accent-5',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
