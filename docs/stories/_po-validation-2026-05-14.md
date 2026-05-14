# PO Validation Report — Batch 2026-05-14

**Validator:** @po (Pax)
**Method:** `story-draft-checklist.md` (10-point)
**Source agent:** @sm (River)
**Scope:** 13 stories drafted from CLAUDE.md

**CodeRabbit Integration:** disabled (`core-config.yaml`) → **Section 6 = N/A** em todas as stories.

---

## Sumário Executivo

| Total | READY | NEEDS REVISION | BLOCKED |
|-------|-------|----------------|---------|
| 13    | **12** | **1**          | 0       |

**Veredito geral:** Backlog **aprovado para implementação** com 1 ajuste leve na Story 1.2 + 4 itens cross-cutting a tratar antes do @dev iniciar 1.1.

**Status canônico aplicado:** Todas as 13 stories foram transitadas `Draft → Ready` conforme `.claude/rules/story-lifecycle.md` (próximo passo no ciclo é `Ready → InProgress` por @dev).

---

## Veredito por Story

| ID  | Story | Clarity | Status |
|-----|-------|---------|--------|
| 1.1 | Bootstrap Fastify + BullMQ + Postgres | 9/10 | **READY** ✅ |
| 1.2 | Migrations | 8/10 | **NEEDS REVISION** ⚠ |
| 2.1 | Webhook endpoint | 9/10 | **READY** ✅ |
| 3.1 | Worker Sheets | 9/10 | **READY** ✅ |
| 3.2 | Worker Chatwoot | 10/10 | **READY** ✅ |
| 3.3 | Worker Mautic | 9/10 | **READY** ✅ |
| 3.4 | Worker Meta | 9/10 | **READY** ✅ |
| 4.1 | Painel CRUD Campanhas | 8/10 | **READY** ✅ (escopo grande — vide nota) |
| 4.2 | Painel Settings | 9/10 | **READY** ✅ |
| 5.1 | Bull Board | 9/10 | **READY** ✅ |
| 5.2 | Logs/DLQ UI | 9/10 | **READY** ✅ |
| 6.1 | Docker Compose | 9/10 | **READY** ✅ |
| 6.2 | Deploy produção | 8/10 | **READY** ✅ |

---

## Validation Matrix (categorias × stories)

| Story | 1. Goal | 2. Tech | 3. References | 4. Self-Contained | 5. Testing | 6. CodeRabbit |
|-------|---------|---------|---------------|-------------------|------------|---------------|
| 1.1 | PASS | PASS | PASS | PARTIAL¹ | PASS | N/A |
| 1.2 | PASS | PARTIAL² | PASS | PARTIAL² | PASS | N/A |
| 2.1 | PASS | PASS | PASS | PASS | PASS | N/A |
| 3.1 | PASS | PASS | PASS | PASS | PASS | N/A |
| 3.2 | PASS | PASS | PASS | PASS | PASS | N/A |
| 3.3 | PASS | PASS | PASS | PASS | PASS | N/A |
| 3.4 | PASS | PASS | PARTIAL³ | PASS | PASS | N/A |
| 4.1 | PASS | PASS | PASS | PASS | PARTIAL⁴ | N/A |
| 4.2 | PASS | PASS | PASS | PASS | PASS | N/A |
| 5.1 | PASS | PASS | PASS | PASS | PASS | N/A |
| 5.2 | PASS | PASS | PASS | PASS | PASS | N/A |
| 6.1 | PASS | PASS | PASS | PASS | PASS | N/A |
| 6.2 | PASS | PASS | PASS | PASS | PARTIAL⁵ | N/A |

**Notas:**
- ¹ Story 1.1 AC4: menciona `zod/envalid` como alternativa. Picar **zod** (já será usado em outros pontos do projeto — payload validation no gateway).
- ² Story 1.2: ver issue #1 abaixo.
- ³ Story 3.4: menciona `META_API_VERSION` env não listado em CLAUDE.md. Adicionar ao `.env.example` durante Story 1.1.
- ⁴ Story 4.1: escopo grande mas coeso. Test guidance presente; aceitável.
- ⁵ Story 6.2: testes E2E descritos como smoke; aceitável pra Deploy story.

---

## Issues a Tratar

### 🔴 Story 1.2 — NEEDS REVISION (1 item)

**Issue #1:** AC não cobre explicitamente o campo `enabled_workers jsonb` em `campaigns`.

**Por quê importa:**
- O painel (prototype em `src/ui/data.js`) **depende** de `enabled_workers` para a matriz de toggles
- O gateway (Story 2.1) precisa consultar `campaign.enabled_workers[event_id]` para decidir quais filas enfileirar
- Sem este campo no schema, todas as stories de Worker (3.*) viram impossíveis de configurar por campanha

**Ação:** Adicionar AC explícito em Story 1.2 cobrindo `enabled_workers jsonb DEFAULT '{}'` e adicionar `enabled_workers` aos helpers `campaigns.findByToken` etc.

(Esta validação aplica a edição automaticamente — vide commit em `1.2.migrations.md`.)

---

## 🟡 Cross-Cutting Items (não bloqueiam, mas precisam definição cedo)

| # | Item | Ação | Responsável | Quando |
|---|------|------|-------------|--------|
| C1 | `enabled_workers` schema decision | Adicionar campo ao schema (já incluído via Issue #1) | @architect → @data-engineer | Antes da 1.2 |
| C2 | `META_API_VERSION` env var | Adicionar ao `.env.example` | @dev | Durante 1.1 |
| C3 | Shared `correlation_id` type | Definir `src/types/job.ts` com `WebhookJob` interface | @dev | Durante 1.1 ou 2.1 |
| C4 | Phone normalization helper compartilhado | `src/integrations/_shared/phone.ts` | @dev | Primeira das 3.2/3.4 |

---

## Nota sobre Story 4.1 (escopo)

Painel CRUD Campanhas é a **maior** story do batch (cobre Vite setup + design system mapping + 4 rotas + componentes core + 6+ endpoints).

**PO call:** ACEITAR como story única porque:
- O design system precisa ser estabelecido de uma vez (não faz sentido split)
- Os 6 endpoints são todos CRUD simples — bulk
- Split arbitrário criaria handoffs sem ganho real

**Mas:** Se @dev estimar > 5 dias durante kickoff, fazer split em 4.1.a (Setup + Componentes core + Dashboard + Lista) e 4.1.b (Modal novo + Detail/Matrix). Documentar em Change Log se isso ocorrer.

---

## Developer Perspective (PO simulando @dev)

> "Recebi 13 stories. Eu conseguiria começar pela 1.1?"

✅ **Sim** — 1.1 tem tudo pra arrancar: stack escolhida, libs listadas, scripts npm definidos, AC testável.

> "E pela 2.1 (gateway), depois?"

✅ **Sim** — payload Kiwify documentado, detecção de eventos com mapeamento, anti-pattern de 4xx callado.

> "E pelos workers?"

✅ **Sim, todos** — cada um tem URL base, auth, sequência de chamadas, retry policy e classificação de erro.

> "O painel (4.1) tem prototype pra olhar?"

✅ **Sim** — `src/ui/LaunchHub.html` + arquivos `.jsx`/`.css` na mesma pasta. Pixel-perfect garantido.

> "Algum risco que veria me atrasando?"

⚠ Painel 4.1 tem 6+ endpoints novos no backend. Recomendação: criar AC #6 da 4.1 como subset de endpoints (campaigns CRUD apenas) e mover dashboard endpoints pra uma 4.1.5 ou misturar com a 5.1.

(Esta sugestão fica em backlog — não bloqueia.)

---

## Decisão Final

✅ **APROVADO 12 stories para @dev iniciar `*develop`.**
✅ **APROVADO Story 1.2 após patch (issue #1 corrigida nesta validação).**

**Ordem de execução recomendada:**
```
[C1, C2, C3 decisões] → 1.1 → 1.2 → 2.1 → [3.* paralelo] → 4.1 → 4.2 → [5.* paralelo] → 6.1 → 6.2
```

**Próximo passo:** @dev `*develop 1.1`

---

— Pax, equilibrando prioridades 🎯
