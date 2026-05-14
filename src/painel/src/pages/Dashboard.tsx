import { useQuery } from '@tanstack/react-query';
import { api, type DashboardSummary, WORKERS } from '../lib/api';
import { Card, SectionLabel, Badge, WorkerChip } from '../components/ui';

export function DashboardPage() {
  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary'),
    refetchInterval: 5_000,
  });

  const data = summary.data;
  const totalsActive = data?.totals.active ?? 0;
  const totalsFailed = data?.totals.failed ?? 0;
  const totalsCompleted = data?.totals.completed ?? 0;
  const totalsWaiting = data?.totals.waiting ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel number="01">Visão geral · estado atual das filas</SectionLabel>
          <h1>Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="green" dot>
            BACKEND LIVE
          </Badge>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card accent="cyan">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Jobs ativos
          </div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tightest">
            {totalsActive}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">processando agora</div>
        </Card>
        <Card accent="purple">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Aguardando
          </div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tightest">
            {totalsWaiting}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">na fila</div>
        </Card>
        <Card accent="green">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Concluídos
          </div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tightest">
            {totalsCompleted}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">últimas 24h (retidos)</div>
        </Card>
        <Card accent={totalsFailed > 0 ? 'red' : 'green'}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Falhas
          </div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tightest">
            {totalsFailed}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">na DLQ</div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2>Por worker</h2>
          {summary.isFetching && (
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted">atualizando…</span>
          )}
        </div>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-dim border-b border-border">
                <th className="px-4 py-2.5 text-left text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Worker
                </th>
                <th className="px-4 py-2.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Active
                </th>
                <th className="px-4 py-2.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Waiting
                </th>
                <th className="px-4 py-2.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Delayed
                </th>
                <th className="px-4 py-2.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Completed
                </th>
                <th className="px-4 py-2.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Failed
                </th>
              </tr>
            </thead>
            <tbody>
              {WORKERS.map((w) => {
                const row = data?.byWorker[w.id];
                return (
                  <tr key={w.id} className="border-b border-border last:border-0 text-muted">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <WorkerChip workerId={w.id} glyph={w.glyph} />
                        <span className="font-semibold text-text">{w.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{row?.active ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row?.waiting ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row?.delayed ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row?.completed ?? 0}</td>
                    <td className={`px-4 py-3 text-right ${(row?.failed ?? 0) > 0 ? 'text-accent-5' : ''}`}>
                      {row?.failed ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
