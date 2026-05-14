# Epic 4 — Painel (Produção)

**Status:** Draft
**Owner:** @ux-design-expert → @dev
**Source:** CLAUDE.md → Roadmap items 8-9 + seção "Painel UI — Rotas"

## Goal

Migrar o prototype HTML/CSS/JS em `src/ui/` para uma stack produtiva (Vite + React + Tailwind seguindo CLAUDE.md), mantendo fidelidade visual 100% ao design system definido.

## Scope

- Setup Vite + React + TypeScript + Tailwind (com tokens do design system)
- 7 rotas (hash ou react-router):
  - `/` Dashboard
  - `/campaigns` Lista
  - `/campaigns/new` Cadastro (modal)
  - `/campaigns/:id` Edição (matrix events × workers, tabs)
  - `/settings` Config global
  - `/queue` Bull Board (Epic 5)
  - `/logs` Eventos não-mapeados + DLQ (Epic 5)
- Fetch real ao backend (substituir `data.js` mock)
- Autenticação básica (ADMIN_USER / ADMIN_PASSWORD do env)

## Out of scope

- Bull Board UI (Epic 5)
- Logs/DLQ UI (Epic 5)
- Deploy (Epic 6)

## Referência fiel ao prototype

`src/ui/LaunchHub.html` já contém o design final aprovado pelo usuário. As stories desta epic devem **recriar pixel-perfect** o que está lá:

- Tipografia: Syne 800 (display) + JetBrains Mono (corpo)
- Paleta: dark default com toggle light, accent `#7C3AED`, semânticas `#06b6d4`/`#10b981`/`#f59e0b`/`#ef4444`
- Componentes: Card com borda colorida lateral, Badge, Callout, Modal, Toast, WebhookUrl copy
- Microinterações: hover states, animações de modal/toast, polling 1.4s nos jobs

## Stories

| ID  | Título | Rotas cobertas |
|-----|--------|----------------|
| 4.1 | Painel React — CRUD Campanhas | `/`, `/campaigns`, `/campaigns/new`, `/campaigns/:id` |
| 4.2 | Painel React — Configurações Globais | `/settings` |

## Definition of Done

- Pixel-perfect vs prototype em `src/ui/LaunchHub.html`
- Light/dark mode com persistência localStorage
- API real (sem mocks) — usa Postgres via backend
- Autenticado por basic auth ADMIN_USER/ADMIN_PASSWORD
- Build de produção otimizado (< 200KB JS inicial)
