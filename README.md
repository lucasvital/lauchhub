# LaunchHub

Launch automation hub for the Loyola Digital team. Receives webhooks from Kiwify, validates the campaign token, enriches the payload, and dispatches independent jobs to four workers: **Sheets**, **Chatwoot**, **Mautic**, **Meta**.

Production target: `https://launches.loyoladigital.com` (Docker Swarm + Traefik).
Source of truth for product spec: [`CLAUDE.md`](./CLAUDE.md).
Story-driven roadmap: [`docs/stories/INDEX.md`](./docs/stories/INDEX.md).

---

## Stack

| Layer            | Tech                                   |
|------------------|----------------------------------------|
| Runtime          | Node.js 18+ (LTS), TypeScript 5, ESM   |
| API              | Fastify 4                              |
| Queues           | BullMQ + Redis                         |
| Database         | PostgreSQL 16                          |
| Frontend (Story 4.x) | Vite + React + Tailwind (prototype in `src/ui/`) |
| Deploy           | Docker Swarm + Traefik                 |

---

## Quick start (local development)

### Prerequisites

- Node.js 18.18+
- Docker Desktop (to run Postgres + Redis locally)
- `npm` (or `pnpm`)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values for the app vars
cp .env.example .env
# At minimum, set ADMIN_PASSWORD; DATABASE_URL/REDIS_URL defaults work with the docker-compose.dev.yml below.

# 3. Start Postgres + Redis (containers)
docker compose -f docker-compose.dev.yml up -d

# 4. Run the gateway
npm run dev
```

The server listens on `http://localhost:3000`. Probe it:

```bash
curl -i http://localhost:3000/health
```

Expected when DB and Redis are up:

```json
{ "ok": true, "version": "0.1.0", "uptime_s": 4, "checks": { "db": true, "redis": true } }
```

Returns `503` if either dependency is unreachable (still responds — does not crash).

---

## Scripts

| Command           | What it does                                          |
|-------------------|-------------------------------------------------------|
| `npm run dev`     | Start Fastify with `tsx watch` (hot reload)           |
| `npm run build`   | Compile TypeScript → `dist/`                          |
| `npm start`       | Run compiled output (`node dist/gateway/server.js`)   |
| `npm run lint`    | ESLint (no autofix)                                   |
| `npm run lint:fix`| ESLint with autofix                                   |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm test`        | Vitest run (single pass)                              |
| `npm run test:watch` | Vitest watch mode                                  |
| `npm run migrate` | (Story 1.2) Apply pending DB migrations               |

---

## Project structure

```text
launchhub/
├── src/
│   ├── gateway/         # Fastify app, routes, middleware     (Story 1.1, 2.1)
│   ├── workers/         # BullMQ workers per service          (Story 3.1-3.4)
│   ├── queue/           # BullMQ Queue setup + Redis conn     (Story 1.1)
│   ├── db/              # Postgres pool + migrations + helpers (Story 1.1, 1.2)
│   ├── integrations/    # External API clients (per worker)   (Story 3.1-3.4)
│   ├── types/           # Shared TS types (WebhookJob, ...)   (Story 1.1)
│   ├── ui/              # Design prototype (HTML/CSS/JS)     ← reference only, not served
│   └── config.ts        # zod-validated env loader            (Story 1.1)
├── tests/               # vitest specs
├── docs/
│   ├── stories/         # AIOX stories (drafted, validated, ready for dev)
│   └── ...
├── docker-compose.dev.yml   # Postgres + Redis for local dev
├── CLAUDE.md            # Product spec, design system, roadmap
└── README.md            # this file
```

---

## Environment variables

Full list in [`.env.example`](./.env.example). Required at boot (others have defaults or are worker-specific):

- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_PASSWORD`

Optional but recommended (workers will fail jobs without them):

- `CHATWOOT_URL`, `CHATWOOT_TOKEN`, `CHATWOOT_ACCOUNT_ID`
- `MAUTIC_URL`, `MAUTIC_CLIENT_ID`, `MAUTIC_CLIENT_SECRET`
- `META_TOKEN`, `META_PHONE_NUMBER_ID`, `META_API_VERSION` (default `v20.0`)
- `GOOGLE_SERVICE_ACCOUNT_JSON`

Validation happens on startup via `src/config.ts` (zod). Missing required vars print an error and exit with code 1.

---

## Troubleshooting

**`/health` returns 503 with `checks.db: false`**
Postgres isn't reachable. Check `docker compose -f docker-compose.dev.yml ps` and inspect logs. Default credentials in the dev compose are `launchhub:launchhub`.

**`/health` returns 503 with `checks.redis: false`**
Redis isn't reachable. Same compose stack — `docker compose -f docker-compose.dev.yml logs redis`.

**`npm run dev` exits with "Invalid environment configuration"**
zod found a missing/invalid env var. The error message lists the offending fields. Copy `.env.example` to `.env` and fill in the required ones.

**TypeScript can't find ioredis types**
Run `npm install` again — ioredis ships types with the package; if you see import errors, your `node_modules` is stale.

---

## Deploy

**Architecture decision (2026-05-14):** Backend on **Coolify (VPS)** + Frontend on **Vercel**.

- **Backend:** `docker-compose.yml` + `Dockerfile` at the repo root. Coolify build pack: "Docker Compose". Two services come up: `launchhub` (gateway, exposes port 3000) and `launchhub-workers` (BullMQ consumers).
- **Frontend:** `src/painel/` is a Vite app. Set Vercel "Root Directory" to `src/painel`, env `VITE_API_BASE_URL=https://launches.loyoladigital.com`.
- Full step-by-step in [`docs/runbook.md`](./docs/runbook.md).

### Local stack (one machine, full)

```bash
# Backend + DB + Redis via Docker
docker compose up -d --build

# Frontend (separate terminal)
cd src/painel
npm install
npm run dev
# → http://localhost:5173
```

## Development workflow

This project uses **AIOX Story-Driven Development**. See [`docs/stories/INDEX.md`](./docs/stories/INDEX.md) for the full backlog. Each story declares its executor (e.g., `@dev`) and quality gate. The intended flow:

```
@sm *draft → @po *validate-story-draft → @dev *develop → @qa *qa-gate → @devops *push
```

Constitutional rules — `@dev` does NOT push (delegate to `@devops`), does NOT modify `Story / AC / Dev Notes` sections of story files (those are owned by `@po` and `@sm`).
