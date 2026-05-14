# LaunchHub — CLAUDE.md

Sistema de automação de lançamentos para gestores de marketing digital.
Recebe eventos do Kiwify, processa em filas independentes e distribui para Sheets, Chatwoot, Mautic e Meta.

---

## Design System

Usar **obrigatoriamente** em qualquer arquivo de UI gerado neste projeto.

### Fontes

```
Display / Títulos : Syne ExtraBold 800 — Google Fonts
Corpo / Código    : JetBrains Mono 400/600/700 — Google Fonts
```

Import:
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
```

### Paleta de Cores

```css
:root {
  /* Base */
  --bg:       #0a0a0f;   /* fundo principal */
  --surface:  #111118;   /* cards, sidebar, code blocks */
  --surface2: #16161f;   /* hover states */
  --border:   #1e1e2e;   /* bordas padrão */
  --border2:  #2a2a3e;   /* bordas hover */
  --dim:      #1a1a2e;   /* fundos internos, table headers */

  /* Texto */
  --text:  #e2e8f0;  /* texto principal */
  --muted: #64748b;  /* texto secundário */
  --muted2:#475569;  /* texto terciário, labels */

  /* Accent principal */
  --accent:      #7C3AED;              /* roxo — cor primária */
  --accent-glow: rgba(124,58,237,0.15);/* roxo transparente */

  /* Accents secundários */
  --accent2: #06b6d4;  /* cyan  — Chatwoot, infos */
  --accent3: #10b981;  /* verde — Sheets, sucesso */
  --accent4: #f59e0b;  /* amber — Meta, avisos */
  --accent5: #ef4444;  /* red   — erros, Redis */
}
```

### Noise Overlay

Aplicar em todo `body` como pseudo-elemento fixo:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
}
```

### Tipografia

```css
/* Títulos de página */
h1 {
  font-family: 'Syne', sans-serif;
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

/* Títulos de seção */
h2 {
  font-family: 'Syne', sans-serif;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
/* h2 tem barra vertical roxa à esquerda: border-left: 3px solid var(--accent) */

/* Subtítulos */
h3 {
  font-family: 'Syne', sans-serif;
  font-size: 14px;
  font-weight: 700;
}
/* h3 tem prefixo // em roxo */

/* Corpo */
body {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
}

/* Labels de seção */
.section-label {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
  border-left: 2px solid var(--border);
  padding-left: 8px;
}

/* Tags/badges inline */
.tag {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 2px;
  border: 1px solid var(--accent);
  color: var(--accent);
}
```

### Componentes

#### Card
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px 24px;
  transition: border-color 0.2s;
}
.card:hover { border-color: var(--border2); }

/* Variantes de borda colorida lateral */
.card.c-purple { border-left: 3px solid var(--accent); }
.card.c-cyan   { border-left: 3px solid var(--accent2); }
.card.c-green  { border-left: 3px solid var(--accent3); }
.card.c-amber  { border-left: 3px solid var(--accent4); }
.card.c-red    { border-left: 3px solid var(--accent5); }
```

#### Badge
```css
.badge {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  font-weight: 600;
}
.badge-purple { background: var(--accent-glow);          color: var(--accent); }
.badge-cyan   { background: rgba(6,182,212,0.12);        color: var(--accent2); }
.badge-green  { background: rgba(16,185,129,0.12);       color: var(--accent3); }
.badge-amber  { background: rgba(245,158,11,0.12);       color: var(--accent4); }
.badge-red    { background: rgba(239,68,68,0.12);        color: var(--accent5); }
```

#### Callout
```css
.callout {
  border-radius: 6px;
  padding: 14px 18px;
  font-size: 12px;
  line-height: 1.7;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.callout-info   { background: rgba(6,182,212,0.07);  border: 1px solid rgba(6,182,212,0.25);  color: var(--accent2); }
.callout-warn   { background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.25); color: #d4a017; }
.callout-tip    { background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.25); color: var(--accent3); }
.callout-danger { background: rgba(239,68,68,0.07);  border: 1px solid rgba(239,68,68,0.25);  color: var(--accent5); }
```

#### Tabela
```css
.table-wrap { overflow-x: auto; border-radius: 6px; border: 1px solid var(--border); }
table       { width: 100%; border-collapse: collapse; }
thead tr    { background: var(--dim); border-bottom: 1px solid var(--border); }
th          { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); padding: 10px 16px; text-align: left; }
td          { padding: 10px 16px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
tr:last-child td { border-bottom: none; }
```

#### Code Block
```css
pre {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px 24px;
  overflow-x: auto;
  position: relative;
}
pre::before {
  content: attr(data-lang);    /* ex: <pre data-lang="typescript"> */
  position: absolute;
  top: 10px; right: 14px;
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted2);
}
code { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text); line-height: 1.7; }
p code, li code { background: var(--dim); color: var(--accent2); padding: 1px 6px; border-radius: 3px; font-size: 11px; }
```

#### Syntax Highlight (classes manuais em HTML)
```
.kw   → var(--accent)   roxo   — keywords, booleans
.str  → var(--accent3)  verde  — strings
.key  → var(--accent2)  cyan   — keys de objeto/SQL
.num  → var(--accent4)  amber  — números
.cm   → var(--muted2)   cinza  — comentários (font-style: italic)
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| API Gateway | Node.js + Fastify |
| Filas | BullMQ + Redis |
| Banco de dados | PostgreSQL |
| Frontend | React + Tailwind |
| Monitor de filas | Bull Board |
| Deploy | Docker Swarm + Traefik |
| Domínio | `launches.loyoladigital.com` |

---

## Arquitetura

```
Kiwify (evento)
      │
      ▼
POST /webhook/:campaign_token
      │
      ▼
[Gateway — Fastify]
  - valida token
  - lookup campanha no Postgres
  - enrich payload com config da campanha
  - enqueue jobs em cada fila ativa
      │
      ├──────────────────────────────────┐
      ▼                                  ▼
[Config Store — Postgres]         [Redis — BullMQ]
  campanhas, tags,                    queue:sheets
  segmentos, templates                queue:chatwoot
  credenciais globais                 queue:mautic
                                      queue:meta
                                           │
              ┌────────────┬──────────────┼──────────────┐
              ▼            ▼              ▼              ▼
        Sheets          Chatwoot        Mautic          Meta
        Worker          Worker          Worker          Worker
```

Cada worker é completamente independente. Se o Chatwoot estiver fora, o Mautic e o Sheets continuam processando normalmente. Falhas ficam na dead letter queue visível no painel.

---

## Estrutura de Pastas

```
launchhub/
├── src/
│   ├── gateway/
│   │   ├── server.ts             # Fastify app
│   │   ├── routes/
│   │   │   └── webhook.ts        # POST /webhook/:token
│   │   └── middleware/
│   │       └── validate.ts
│   ├── workers/
│   │   ├── sheets.worker.ts
│   │   ├── chatwoot.worker.ts
│   │   ├── mautic.worker.ts
│   │   └── meta.worker.ts
│   ├── queue/
│   │   ├── index.ts              # BullMQ setup
│   │   └── jobs.ts               # Job definitions
│   ├── db/
│   │   ├── index.ts              # Postgres connection
│   │   ├── campaigns.ts
│   │   └── migrations/
│   ├── ui/                       # React frontend
│   └── config.ts                 # Env vars
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── CLAUDE.md
```

---

## Config Store — Schema

### Tabela `campaigns`

```sql
CREATE TABLE campaigns (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  campaign_token      text        UNIQUE NOT NULL, -- usado na URL do webhook
  product_id          text,                        -- product_id do Kiwify

  -- Google Sheets
  sheets_id           text,

  -- Chatwoot
  chatwoot_inbox_id   integer,
  chatwoot_tags       jsonb,  -- { "compra_aprovada": ["aluno","fzl1"] }

  -- Mautic
  mautic_segment_id   integer,
  mautic_tags         jsonb,  -- { "compra_aprovada": ["comprador-fzl1"] }

  -- Meta
  meta_templates      jsonb,  -- { "compra_aprovada": "boas_vindas_fzl1" }

  active              boolean     DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

### Tabela `global_config`

```sql
CREATE TABLE global_config (
  key    text PRIMARY KEY, -- ex: "chatwoot_url", "mautic_url"
  value  text
);
```

### Tabela `unmatched_events`

```sql
CREATE TABLE unmatched_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payload    jsonb,
  token      text,
  created_at timestamptz DEFAULT now()
);
```

---

## Gateway

O gateway sempre retorna `200` para o Kiwify, mesmo em erro interno. Isso evita que o Kiwify pare de enviar eventos.

```typescript
// src/gateway/routes/webhook.ts
fastify.post('/webhook/:token', async (req, reply) => {
  const campaign = await db.campaigns.findByToken(req.params.token)

  if (!campaign) {
    await db.unmatchedEvents.save({ payload: req.body, token: req.params.token })
    return reply.code(200).send({ ok: true }) // sempre 200 pro Kiwify
  }

  const payload = enrich(req.body, campaign)

  await Promise.all([
    queues.sheets.add(payload),
    queues.chatwoot.add(payload),
    queues.mautic.add(payload),
    queues.meta.add(payload),
  ])

  reply.send({ ok: true })
})
```

---

## Workers

### Sheets Worker

Appenda linha na planilha da campanha via Google Sheets API v4. Auth via service account JSON.

Colunas: `timestamp`, `event`, `name`, `email`, `phone`, `order_id`, `payment_method`, `value`

### Chatwoot Worker

> ⚠ A API de labels do Chatwoot **sobrescreve** ao invés de acumular. Sempre fazer GET das labels existentes, merge, e então POST.

```
1. GET  /api/v1/accounts/:id/contacts/search?q={phone}
2. if not found → POST /api/v1/accounts/:id/contacts
3. GET  /api/v1/accounts/:id/contacts/:cid/labels  // busca labels atuais
4. POST /api/v1/accounts/:id/contacts/:cid/labels  // merge + novas tags
```

Auth: `api_access_token` no header. Base URL: `https://chat.loyoladigital.com`

### Mautic Worker

```
1. GET  /api/contacts?search=email:{email}
2. if not found → POST /api/contacts/new
3. PATCH /api/contacts/:id/edit              // aplica tags
4. POST  /api/segments/:segId/contact/:cid/add
```

Auth: OAuth2 (client_id + client_secret). Base URL: variável `MAUTIC_URL`.

### Meta Worker

Envia template HSM via Meta Cloud API. Template configurável por evento da campanha. Telefone formatado com DDI 55.

---

## Eventos Kiwify

| Evento | Workers padrão |
|---|---|
| `compra_aprovada` | Sheets · Chatwoot · Mautic · Meta |
| `carrinho_abandonado` | Sheets · Chatwoot · Mautic |
| `pix_gerado` | Sheets · Chatwoot |
| `boleto_gerado` | Sheets · Chatwoot |
| `compra_recusada` | Sheets · Chatwoot |
| `compra_reembolsada` | Sheets · Mautic |
| `subscription_canceled` | Sheets · Mautic |
| `subscription_renewed` | Sheets · Mautic · Meta |

> Quais workers rodam por evento é configurável por campanha no painel.

### Payload de referência (Kiwify)

```json
{
  "order_id": "7f7e2b76-6339-49af-8788-e753e76b61c1",
  "order_ref": "UOcHGBY",
  "order_status": "paid",
  "payment_method": "credit_card",
  "Products": [
    { "product_id": "abc123", "name": "Meu Filho Bilíngue" }
  ],
  "Customer": {
    "name": "João Silva",
    "email": "joao@email.com",
    "mobile": "41999999999"
  }
}
```

---

## Retry & Error Handling

| Tentativa | Delay | Ação |
|---|---|---|
| 1ª | imediato | Processa normalmente |
| 2ª | 30 segundos | Retry automático |
| 3ª | 5 minutos | Retry automático |
| 4ª | 30 minutos | Retry automático |
| falha final | — | → Dead Letter Queue |

Jobs na DLQ ficam visíveis no painel com opção de reprocessar manualmente.

---

## Painel UI — Rotas

| Rota | Descrição |
|---|---|
| `/` | Dashboard — jobs em tempo real, métricas |
| `/campaigns` | Lista de campanhas ativas |
| `/campaigns/new` | Cadastro — gera webhook URL automaticamente |
| `/campaigns/:id` | Editar campanha e configurações por evento |
| `/settings` | Config global: URLs, tokens, service account |
| `/queue` | Bull Board — monitor de filas em tempo real |
| `/logs` | Eventos não mapeados e dead letter queue |

---

## Docker Compose

```yaml
version: '3.8'

services:
  launchhub:
    build: .
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - PORT=3000
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.launchhub.rule=Host(`launches.loyoladigital.com`)"
      - "traefik.http.routers.launchhub.entrypoints=websecure"
      - "traefik.http.routers.launchhub.tls.certresolver=letsencrypt"
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    networks:
      - traefik-public

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - traefik-public

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_DB=launchhub
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - traefik-public

volumes:
  redis_data:
  postgres_data:

networks:
  traefik-public:
    external: true
```

---

## Variáveis de Ambiente

```env
# App
PORT=3000
NODE_ENV=production
ADMIN_USER=lucas
ADMIN_PASSWORD=

# Banco
DATABASE_URL=postgresql://user:pass@postgres:5432/launchhub
REDIS_URL=redis://redis:6379

# Chatwoot (self-hosted)
CHATWOOT_URL=https://chat.loyoladigital.com
CHATWOOT_TOKEN=
CHATWOOT_ACCOUNT_ID=

# Mautic (self-hosted)
MAUTIC_URL=
MAUTIC_CLIENT_ID=
MAUTIC_CLIENT_SECRET=

# Meta Cloud API
META_TOKEN=
META_PHONE_NUMBER_ID=

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_JSON=
```

---

## Roadmap

- [ ] Setup inicial — Fastify + BullMQ + Postgres
- [ ] Migrations do banco
- [ ] Gateway + validação de webhook
- [ ] Worker: Sheets
- [ ] Worker: Chatwoot
- [ ] Worker: Mautic
- [ ] Worker: Meta
- [ ] Painel React — CRUD de campanhas
- [ ] Painel React — configurações globais
- [ ] Bull Board integrado
- [ ] Log de eventos e DLQ
- [ ] Docker Compose final + Traefik labels
- [ ] Deploy no loyola

---

*Loyola Digital — Lucas Vital Silva*
