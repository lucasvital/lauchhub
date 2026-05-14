# Epic 2 — Gateway de Webhooks

**Status:** Draft
**Owner:** @architect → @dev
**Source:** CLAUDE.md → Roadmap item 3 + seção "Gateway"

## Goal

Endpoint público que recebe webhooks do Kiwify, valida o token de campanha, enriquece o payload e enfileira jobs nas filas dos workers ativos.

## Scope

- `POST /webhook/:campaign_token` (Fastify)
- Lookup da campanha no Postgres por `campaign_token`
- Não encontrada → salvar em `unmatched_events`, responder 200 ao Kiwify
- Encontrada → enrich payload com config da campanha e enfileirar nos workers habilitados para o evento
- **SEMPRE** responder 200 ao Kiwify (mesmo em erro interno) — Kiwify para de enviar em 4xx/5xx
- Estrutura `src/gateway/` (server.ts, routes/, middleware/)

## Out of scope

- Implementação dos workers (Epic 3) — apenas enfileirar
- Bull Board (Epic 5)
- Autenticação no endpoint além do token na URL

## Stories

| ID  | Título | Executor |
|-----|--------|----------|
| 2.1 | Endpoint POST /webhook/:token | @dev |

## Definition of Done

- POST com token válido enfileira jobs em `queue:sheets`, `queue:chatwoot`, `queue:mautic`, `queue:meta` conforme `enabled_workers[event]`
- POST com token inválido grava em `unmatched_events` e ainda retorna 200
- Erro interno (DB fora, Redis fora) ainda retorna 200 e loga
- Testes de integração cobrem os 3 caminhos (match / unmatched / error)
