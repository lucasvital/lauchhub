import { useQuery } from '@tanstack/react-query';
import { api, type StatusCheck, type StatusResponse } from '../lib/api';
import { Card, Button, SectionLabel, Badge } from '../components/ui';

const GROUPS: { id: StatusCheck['group']; label: string; accent: 'green' | 'cyan' | 'purple' | 'amber' | 'red' }[] = [
  { id: 'infra', label: 'Infraestrutura', accent: 'purple' },
  { id: 'sheets', label: 'Google Sheets', accent: 'green' },
  { id: 'chatwoot', label: 'Chatwoot', accent: 'cyan' },
  { id: 'mautic', label: 'Mautic', accent: 'purple' },
  { id: 'sendflow', label: 'SendFlow', accent: 'red' },
];

function Dot({ check }: { check: StatusCheck }) {
  const color = !check.configured ? 'bg-muted-2' : check.ok ? 'bg-accent-3' : 'bg-accent-5';
  const ring = !check.configured
    ? ''
    : check.ok
      ? 'shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
      : 'shadow-[0_0_0_3px_rgba(248,113,113,0.15)]';
  return <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${color} ${ring}`} />;
}

function Row({ check }: { check: StatusCheck }) {
  const status = !check.configured ? 'não configurado' : check.ok ? 'ok' : 'falhou';
  return (
    <div className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
      <div className="pt-1">
        <Dot check={check} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-text">{check.label}</span>
          {check.latency_ms != null && check.configured && (
            <span className="text-[10px] text-muted-2">{check.latency_ms}ms</span>
          )}
        </div>
        {check.detail && (
          <div
            className={`mt-0.5 truncate text-[10px] leading-relaxed ${
              check.ok || !check.configured ? 'text-muted-2' : 'text-accent-5'
            }`}
            title={check.detail}
          >
            {check.detail}
          </div>
        )}
      </div>
      <span
        className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] ${
          !check.configured ? 'text-muted-2' : check.ok ? 'text-accent-3' : 'text-accent-5'
        }`}
      >
        {status}
      </span>
    </div>
  );
}

export function StatusPage() {
  const q = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<StatusResponse>('/api/status'),
    refetchInterval: 20_000,
  });

  const checks = q.data?.checks ?? [];
  const problems = q.data?.problems ?? 0;
  const configured = checks.filter((c) => c.configured);
  const allOk = configured.length > 0 && problems === 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="06">Saúde das integrações</SectionLabel>
          <h1>Status</h1>
        </div>
        <div className="flex items-center gap-3">
          {q.data && (
            <span className="text-[10px] text-muted-2">
              verificado {new Date(q.data.checked_at).toLocaleTimeString('pt-BR')}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? 'verificando…' : '↻ atualizar'}
          </Button>
        </div>
      </div>

      <div className="mb-6">
        {q.isLoading ? (
          <Badge color="muted" dot>
            verificando…
          </Badge>
        ) : q.isError ? (
          <Badge color="red" dot>
            não foi possível checar
          </Badge>
        ) : allOk ? (
          <Badge color="green" dot>
            ✓ tudo funcional
          </Badge>
        ) : (
          <Badge color="red" dot>
            {problems} problema(s)
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = checks.filter((c) => c.group === g.id);
          if (rows.length === 0) return null;
          const groupProblems = rows.filter((c) => c.configured && !c.ok).length;
          return (
            <Card key={g.id} accent={g.accent}>
              <div className="mb-2 flex items-center justify-between">
                <h3>// {g.label}</h3>
                {groupProblems > 0 ? (
                  <Badge color="red">{groupProblems} falha(s)</Badge>
                ) : (
                  <Badge color="green">ok</Badge>
                )}
              </div>
              <div>
                {rows.map((c) => (
                  <Row key={c.id} check={c} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {!q.isLoading && configured.length === 0 && (
        <p className="mt-6 text-[11px] text-muted-2">
          Nenhuma integração configurada ainda. Cadastre credenciais em Integrações / Configurações.
        </p>
      )}
    </div>
  );
}
