# LaunchHub — Stories Index

**Fonte de verdade:** [`CLAUDE.md`](../../CLAUDE.md) (raiz do projeto)
**Status do projeto:** Greenfield — apenas spec + prototype UI dropped em `src/ui/`

> ⚠️ **Nota AIOX:** Estas stories foram draftadas pelo @sm a partir do CLAUDE.md (que serve como PRD).
> Formalmente, @pm deveria criar a estrutura de epics primeiro via `*create-epic`. Os epics aqui foram
> derivados diretamente do **Roadmap** no fim do CLAUDE.md. Recomenda-se que @po valide cada story
> via `*validate-story-draft` antes de @dev iniciar implementação.

---

## Epics

| Epic | Título | Stories | Status |
|------|--------|---------|--------|
| 1 | [Foundation & Persistence](./epics/epic-1-foundation/README.md) | 1.1, 1.2 | InReview |
| 2 | [Gateway de Webhooks](./epics/epic-2-gateway/README.md) | 2.1 | InReview |
| 3 | [Workers Independentes](./epics/epic-3-workers/README.md) | 3.1, 3.2, 3.3, 3.4 | InReview |
| 4 | [Painel — Produção](./epics/epic-4-painel/README.md) | 4.1, 4.2 | InReview |
| 5 | [Observabilidade](./epics/epic-5-observability/README.md) | 5.1, 5.2 | InReview |
| 6 | [Deploy & Infra](./epics/epic-6-deploy/README.md) | 6.1, 6.2 | InReview |

---

## Stories (ordem de execução sugerida)

| ID  | Título                                                | Executor          | Quality Gate       | Status | Depends on |
|-----|-------------------------------------------------------|-------------------|--------------------|--------|------------|
| 1.1 | [Bootstrap Fastify + BullMQ + Postgres](./1.1.bootstrap-stack.md) | @dev              | @architect         | InReview | —          |
| 1.2 | [Migrations: campaigns, global_config, unmatched_events](./1.2.migrations.md) | @data-engineer    | @dev               | InReview | 1.1        |
| 2.1 | [Endpoint POST /webhook/:token](./2.1.webhook-endpoint.md) | @dev              | @architect         | InReview | 1.1, 1.2   |
| 3.1 | [Worker: Sheets (Google Sheets append)](./3.1.worker-sheets.md) | @dev              | @architect         | InReview | 2.1        |
| 3.2 | [Worker: Chatwoot (contato + labels merge)](./3.2.worker-chatwoot.md) | @dev              | @architect         | InReview | 2.1        |
| 3.3 | [Worker: Mautic (contato + segmento + tags)](./3.3.worker-mautic.md) | @dev              | @architect         | InReview | 2.1        |
| 3.4 | [Worker: Meta (template HSM via Cloud API)](./3.4.worker-meta.md) | @dev              | @architect         | InReview | 2.1        |
| 4.1 | [Painel React — CRUD de Campanhas](./4.1.painel-campaigns.md) | @dev              | @ux-design-expert  | InReview | 1.2, 2.1   |
| 4.2 | [Painel React — Configurações Globais](./4.2.painel-settings.md) | @dev              | @ux-design-expert  | InReview | 4.1        |
| 5.1 | [Bull Board integrado](./5.1.bull-board.md) | @dev              | @architect         | InReview | 3.1-3.4    |
| 5.2 | [Logs UI: Eventos não-mapeados + DLQ](./5.2.logs-dlq.md) | @dev              | @architect         | InReview | 4.1, 5.1   |
| 6.1 | [Docker Compose + Traefik labels](./6.1.docker-compose.md) | @devops           | @architect         | InReview | 1.1, 3.*   |
| 6.2 | [Deploy em launches.loyoladigital.com](./6.2.deploy-production.md) | @devops           | @architect         | InReview | 6.1, 4.*, 5.*|

---

## Fluxo de execução (AIOX SDC)

Cada story segue o **Story Development Cycle**:

1. **@sm** — `*draft` (✓ feito aqui)
2. **@po** — `*validate-story-draft` (10-point checklist)
3. **@dev** ou executor designado — `*develop` (implementa)
4. **Quality Gate agent** — review estrutural
5. **@qa** — `*qa-gate` (PASS / CONCERNS / FAIL)
6. **@devops** — `*push` (única autoridade de push/PR)

## Origem das stories

Cada story rastreia ao item do roadmap em `CLAUDE.md`:

> - [ ] Setup inicial — Fastify + BullMQ + Postgres → **1.1**
> - [ ] Migrations do banco → **1.2**
> - [ ] Gateway + validação de webhook → **2.1**
> - [ ] Worker: Sheets → **3.1**
> - [ ] Worker: Chatwoot → **3.2**
> - [ ] Worker: Mautic → **3.3**
> - [ ] Worker: Meta → **3.4**
> - [ ] Painel React — CRUD de campanhas → **4.1**
> - [ ] Painel React — configurações globais → **4.2**
> - [ ] Bull Board integrado → **5.1**
> - [ ] Log de eventos e DLQ → **5.2**
> - [ ] Docker Compose final + Traefik labels → **6.1**
> - [ ] Deploy no loyola → **6.2**
