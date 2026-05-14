# Epic 6 — Deploy & Infra

**Status:** Draft
**Owner:** @devops (Gage)
**Source:** CLAUDE.md → Roadmap items 12-13 + seção "Docker Compose"

## Goal

Aplicação rodando em produção no domínio `launches.loyoladigital.com` com TLS automático via Traefik.

## Scope

- Dockerfile multi-stage (build → runtime slim)
- docker-compose.yml com 3 serviços: `launchhub`, `redis`, `postgres`
- Network externa `traefik-public`
- Labels Traefik: roteamento + TLS Let's Encrypt
- Resource limits (0.5 CPU / 512M conforme CLAUDE.md)
- Volumes persistentes para Redis e Postgres

## Stories

| ID  | Título | Executor |
|-----|--------|----------|
| 6.1 | Docker Compose + Traefik labels | @devops |
| 6.2 | Deploy em launches.loyoladigital.com | @devops |

## Definition of Done

- `docker compose up -d` sobe stack completa localmente
- Em produção (Docker Swarm), acessar `https://launches.loyoladigital.com` carrega painel
- Certificado TLS válido (Let's Encrypt via Traefik)
- Redis e Postgres com volumes persistentes (dados sobrevivem `compose down`)
- Logs centralizados (stdout dos containers + driver de log apropriado)
