# Epic 5 — Observabilidade

**Status:** Draft
**Owner:** @architect → @dev
**Source:** CLAUDE.md → Roadmap items 10-11

## Goal

Painel operacional ao vivo: jobs em tempo real (Bull Board), eventos não-mapeados e DLQ com reprocessamento manual.

## Scope

- Bull Board montado em `/queue` (autenticado)
- Listagem de `unmatched_events` com payload JSON expandível
- Listagem da DLQ por fila
- Botão **Reprocessar** (individual e bulk) — reenfileira o job na fila origem
- Botão **Descartar** para `unmatched_events`

## Stories

| ID  | Título | Executor |
|-----|--------|----------|
| 5.1 | Bull Board integrado | @dev |
| 5.2 | Logs UI: Eventos não-mapeados + DLQ | @dev |

## Definition of Done

- Bull Board acessível via `/queue` com auth
- Lista de DLQ com filtro por worker/evento/token e busca por email
- Reprocessar move o job da DLQ pra fila ativa
- Reprocessar em lote dispara com spread temporal (evitar rate limit)
- Toast de confirmação por ação
