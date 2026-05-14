# Epic 3 — Workers Independentes

**Status:** Draft
**Owner:** @architect → @dev
**Source:** CLAUDE.md → Roadmap items 4-7 + seção "Workers"

## Goal

4 workers BullMQ totalmente independentes — cada um consome sua fila própria, falhas não afetam os outros. Cada worker conhece sua API externa específica.

## Scope

- `src/workers/sheets.worker.ts`
- `src/workers/chatwoot.worker.ts`
- `src/workers/mautic.worker.ts`
- `src/workers/meta.worker.ts`
- Cada worker implementa retry policy padrão (1 → 30s → 5min → 30min → DLQ)
- Cada worker recebe payload enriquecido (campanha + evento + dados do contato)
- Dead Letter Queue por worker

## Out of scope

- Reprocessamento manual da DLQ (Epic 5)
- Bull Board UI (Epic 5)

## Stories

| ID  | Título | API | Auth |
|-----|--------|-----|------|
| 3.1 | Worker: Sheets | Google Sheets API v4 | Service Account JSON |
| 3.2 | Worker: Chatwoot | Chatwoot self-hosted REST | api_access_token |
| 3.3 | Worker: Mautic | Mautic REST | OAuth2 (client_id + secret) |
| 3.4 | Worker: Meta | Meta Cloud API (WhatsApp) | Permanent token + phone_number_id |

## Detalhes críticos do CLAUDE.md

- **Sheets:** colunas fixas (`timestamp`, `event`, `name`, `email`, `phone`, `order_id`, `payment_method`, `value`)
- **Chatwoot:** ⚠ API de labels **sobrescreve** — sempre GET → merge → POST
- **Mautic:** sequência GET search → POST new (se ausente) → PATCH tags → POST segment add
- **Meta:** telefone formatado com DDI 55, template configurável por evento

## Definition of Done (cada worker)

- Job consumido sem erro produz mudança real no sistema externo (planilha apendada, contato criado, etc.)
- Retry policy automática
- Falha terminal vai pra DLQ visível
- Logs estruturados (correlation_id por job)
- Resiliência: serviço externo fora → retry → DLQ, sem travar fila
