# LaunchHub — Operational Runbook

Production stack: **Backend (Coolify @ VPS Loyola)** + **Frontend (Vercel)**.

## Service map

| Component | Where | URL |
|-----------|-------|-----|
| Gateway (`POST /webhook/:token`, `/api/*`) | Coolify | `https://launches.loyoladigital.com` |
| Workers (sheets/chatwoot/mautic/meta) | Coolify (separate service) | n/a (queue consumers) |
| Postgres | Coolify (managed via compose) | postgres:5432 (internal) |
| Redis | Coolify (managed via compose) | redis:6379 (internal) |
| Bull Board UI | Coolify (gateway service) | `https://launches.loyoladigital.com/queue` |
| Painel React | Vercel | `https://<project>.vercel.app` (or custom domain) |

---

## First-time deploy

### Backend (Coolify)

1. **DNS:** Configure A record `launches.loyoladigital.com` → IP do VPS Coolify.
2. **Coolify UI:**
   - Create new app → "Public repository" → repo URL
   - Build pack: **Docker Compose**
   - Compose file: `docker-compose.yml` (root)
3. **Env vars** (Settings → Environment Variables — mark secrets):
   - `POSTGRES_PASSWORD` (secret, strong)
   - `SESSION_SECRET` (secret, 32+ chars random)
   - `ADMIN_USER`, `ADMIN_PASSWORD` (secret)
   - `CORS_ALLOWED_ORIGIN` = `https://<vercel-domain>` (multiple comma-separated allowed)
   - All Chatwoot/Mautic/Meta/Sheets credentials (secrets)
4. **Domain:** Settings → Domain → add `launches.loyoladigital.com`. Coolify provisions Let's Encrypt automatically.
5. **Deploy.**
6. **Migrations:**
   ```bash
   # SSH into the VPS, then:
   docker exec -it <launchhub-container> npm run migrate
   ```
7. **Verify:** `curl https://launches.loyoladigital.com/health` → 200.

### Frontend (Vercel)

1. **Vercel UI:** Import Git repo → set Root Directory to `src/painel`.
2. **Env vars** (Production + Preview):
   - `VITE_API_BASE_URL=https://launches.loyoladigital.com`
3. **Deploy.** Vercel auto-detects Vite preset.
4. **(Optional)** Custom domain → Settings → Domains.

### Wiring

5. **CORS** — back to Coolify, set `CORS_ALLOWED_ORIGIN` to the Vercel URL → restart.
6. **First login:** open Vercel URL → login with `ADMIN_USER` / `ADMIN_PASSWORD`.
7. **Cadastrar campanha** real (ex: `dg-pg02`) via painel.
8. **Kiwify webhook:** Painel Kiwify → cadastrar URL `https://launches.loyoladigital.com/webhook/dg-pg02`.

---

## Common operations

### Restart app
**Coolify UI:** App → "Restart" button. Volumes preserved.

### Rollback
**Coolify UI:** App → Deployments → "Rollback to this deployment" on the previous green deploy.
**Vercel UI:** Deployments → previous build → "Promote to Production".

### Read logs
**Coolify UI:** App → Logs (live tail).
**Vercel UI:** Project → Logs (per deployment + runtime).

### Rotate a credential (e.g. Meta token)
1. Update env var in Coolify (and in `/settings` UI for global_config keys).
2. Coolify auto-restarts the service.
3. Workers reconnect on next job.

### Run a migration (after a release)
```bash
docker exec -it <launchhub-container> npm run migrate
```

### Manually retry a DLQ job
- Open `/logs` in the painel → DLQ tab → "Reprocessar" on the row.
- Or open `/queue` (Bull Board) → Failed → click the job → "Retry".

### Inspect a contact's lifecycle in production
1. Get `correlation_id` from the application log of the originating webhook.
2. `grep correlation_id` across worker logs to see fan-out path.
3. Cross-reference with the Sheets row (`order_id`) and Chatwoot contact.

---

## Backup & restore

### Postgres backup

Manual:
```bash
docker exec <postgres-container> pg_dump -U launchhub launchhub > backup-$(date +%F).sql
```

Automated (recommended):
- Add a cron container running `pg_dump` daily → upload to B2/S3.
- Retention: 30 days suggested.

### Restore
```bash
docker exec -i <postgres-container> psql -U launchhub -d launchhub < backup.sql
```

---

## Incident playbooks

### Webhooks failing en masse
1. Check `/health` returns 200 — if 503, fix DB/Redis first.
2. Check `/queue` (Bull Board) for FAILED counts per worker.
3. If a single worker is broken (e.g. Meta auth):
   - Go to `/settings` → click "testar" for that service.
   - If 401: rotate token, save, click testar again.
4. Once healthy, click "Reprocessar todos" in `/logs` DLQ.

### Postgres connection storms
- Pool size is 10. If you see "too many connections":
  - Restart launchhub service (drops idle conns).
  - Check Postgres max_connections setting.

### Redis OOM
- Set `maxmemory` on the Redis service in compose.
- BullMQ default removes completed after 24h / 5000 jobs.

---

## Security checklist (post-MVP hardening)

- [ ] Encrypt secrets at rest in `global_config` (currently plaintext)
- [ ] Move `ADMIN_PASSWORD` to argon2 hash in DB instead of env
- [ ] Webhook signature validation (Kiwify HMAC if available)
- [ ] Rate limit `/webhook/:token` per token (currently uncapped)
- [ ] Audit log table for `/api/settings` changes
- [ ] Add `helmet` for HTTP security headers
- [ ] Restrict `/queue` Bull Board to specific IPs (or further harden auth)
