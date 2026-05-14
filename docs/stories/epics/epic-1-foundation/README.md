# Epic 1 — Foundation & Persistence

**Status:** Draft
**Owner:** @architect (design) → @dev / @data-engineer (execução)
**Source:** CLAUDE.md → Roadmap items 1 e 2

## Goal

Bootstrap do projeto Node + Fastify + BullMQ + Postgres com schema persistido, pronto para receber o gateway e workers.

## Scope

- Estrutura de pastas conforme `src/` em CLAUDE.md
- TypeScript, ESM, scripts npm padrão (dev / build / test / lint / typecheck)
- Conexão Postgres com pooling
- Conexão Redis para BullMQ
- Schema inicial: `campaigns`, `global_config`, `unmatched_events`
- Migrations versionadas (drizzle ou node-pg-migrate — decidir na 1.1)

## Out of scope

- Endpoint de webhook (Epic 2)
- Workers (Epic 3)
- Frontend (Epic 4)
- Docker (Epic 6)

## Stories

| ID  | Título | Executor |
|-----|--------|----------|
| 1.1 | Bootstrap Fastify + BullMQ + Postgres | @dev |
| 1.2 | Migrations: campaigns, global_config, unmatched_events | @data-engineer |

## Definition of Done

- `npm run dev` sobe servidor Fastify respondendo `/health`
- `npm run migrate` aplica schema do zero em DB limpo
- Tabelas `campaigns`, `global_config`, `unmatched_events` existem com colunas e constraints conforme CLAUDE.md
- README com setup local funcional
