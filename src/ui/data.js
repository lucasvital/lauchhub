// ─── LaunchHub mock data ───
// Single source of truth for the prototype.

const EVENTS = [
  { id: 'compra_aprovada',       label: 'Compra Aprovada',       sub: 'paid',              color: 'green',  default: ['sheets','chatwoot','mautic','meta'] },
  { id: 'carrinho_abandonado',   label: 'Carrinho Abandonado',   sub: 'abandoned_cart',    color: 'amber',  default: ['sheets','chatwoot','mautic'] },
  { id: 'pix_gerado',            label: 'Pix Gerado',            sub: 'pix.generated',     color: 'cyan',   default: ['sheets','chatwoot'] },
  { id: 'boleto_gerado',         label: 'Boleto Gerado',         sub: 'billet.generated',  color: 'cyan',   default: ['sheets','chatwoot'] },
  { id: 'compra_recusada',       label: 'Compra Recusada',       sub: 'refused',           color: 'red',    default: ['sheets','chatwoot'] },
  { id: 'compra_reembolsada',    label: 'Compra Reembolsada',    sub: 'refunded',          color: 'red',    default: ['sheets','mautic'] },
  { id: 'subscription_canceled', label: 'Subscription Canceled', sub: 'sub.canceled',      color: 'red',    default: ['sheets','mautic'] },
  { id: 'subscription_renewed',  label: 'Subscription Renewed',  sub: 'sub.renewed',       color: 'green',  default: ['sheets','mautic','meta'] },
];

const WORKERS = [
  { id: 'sheets',   label: 'Sheets',   color: 'green',  glyph: 'S' },
  { id: 'chatwoot', label: 'Chatwoot', color: 'cyan',   glyph: 'C' },
  { id: 'mautic',   label: 'Mautic',   color: 'purple', glyph: 'M' },
  { id: 'meta',     label: 'Meta',     color: 'amber',  glyph: 'W' },
];

const CAMPAIGNS = [
  {
    id: '7f7e2b76-6339-49af-8788-e753e76b61c1',
    name: 'Desafio Gestão PG02',
    token: 'dg-pg02',
    product_id: 'kw_prod_4f81xa',
    product_name: 'Black Belt em Gestão de Performance',
    sheets_id: '1a2B3cD4Ef5GhIjK6lMnOpQ_rstuvWxyz',
    chatwoot_inbox_id: 14,
    chatwoot_tags: {
      compra_aprovada:     ['aluno','dg-pg02','comprador-2026'],
      carrinho_abandonado: ['lead-quente','dg-pg02'],
      pix_gerado:          ['lead-pix','dg-pg02'],
    },
    mautic_segment_id: 38,
    mautic_tags: {
      compra_aprovada: ['comprador-dgpg02','aluno-ativo'],
      carrinho_abandonado: ['carrinho-dgpg02'],
    },
    meta_templates: {
      compra_aprovada: 'boas_vindas_dgpg02_v3',
      pix_gerado:      'pix_lembrete_24h',
    },
    enabled_workers: {
      compra_aprovada:       ['sheets','chatwoot','mautic','meta'],
      carrinho_abandonado:   ['sheets','chatwoot','mautic'],
      pix_gerado:            ['sheets','chatwoot'],
      boleto_gerado:         ['sheets','chatwoot'],
      compra_recusada:       ['sheets','chatwoot'],
      compra_reembolsada:    ['sheets','mautic'],
      subscription_canceled: ['sheets','mautic'],
      subscription_renewed:  ['sheets','mautic','meta'],
    },
    active: true,
    created_at: '2026-04-22T14:18:00-03:00',
    stats: { '24h': 1284, '7d': 7842, '30d': 24380, success_rate: 0.987 },
  },
  {
    id: 'b1a8c9f2-7421-4dde-90c3-1234c0a8e567',
    name: 'Black Belt Excel — Pré-lançamento 1',
    token: 'bbe-pr1',
    product_id: 'kw_prod_9k2m1d',
    product_name: 'Black Belt em Excel',
    sheets_id: '1zXC8DvB9NmAsErTyUiOpQwErTyUiOpAs',
    chatwoot_inbox_id: 7,
    chatwoot_tags: {
      compra_aprovada: ['aluno','bbe-pr1'],
      carrinho_abandonado: ['lead-bbe','pr1'],
    },
    mautic_segment_id: 21,
    mautic_tags: {
      compra_aprovada: ['comprador-bbepr1'],
    },
    meta_templates: {
      compra_aprovada: 'welcome_bbe_pr1',
    },
    enabled_workers: {
      compra_aprovada:       ['sheets','chatwoot','mautic','meta'],
      carrinho_abandonado:   ['sheets','chatwoot','mautic'],
      pix_gerado:            ['sheets','chatwoot'],
      boleto_gerado:         ['sheets','chatwoot'],
      compra_recusada:       ['sheets','chatwoot'],
      compra_reembolsada:    ['sheets'],
      subscription_canceled: ['sheets','mautic'],
      subscription_renewed:  ['sheets','mautic','meta'],
    },
    active: true,
    created_at: '2026-05-02T09:42:00-03:00',
    stats: { '24h': 3417, '7d': 14820, '30d': 14820, success_rate: 0.972 },
  },
  {
    id: 'c45d2e3f-aaaa-44bb-99cc-dd11ee22ff33',
    name: 'Imersão Copy Direto — VIP',
    token: 'icd-vip04',
    product_id: 'kw_prod_8h7n5z',
    product_name: 'Imersão Copy Direto Vol. 4',
    sheets_id: '1aBcDe7Fg8HiJkLmNoPqRsTuVwXyZ123456',
    chatwoot_inbox_id: 11,
    chatwoot_tags: {
      compra_aprovada: ['aluno-vip','icd-vip04'],
    },
    mautic_segment_id: 44,
    mautic_tags: { compra_aprovada: ['comprador-icd-vip'] },
    meta_templates: { compra_aprovada: 'boas_vindas_icd_vip' },
    enabled_workers: {
      compra_aprovada:       ['sheets','chatwoot','mautic','meta'],
      carrinho_abandonado:   ['sheets','chatwoot'],
      pix_gerado:            ['sheets','chatwoot'],
      boleto_gerado:         ['sheets'],
      compra_recusada:       ['sheets'],
      compra_reembolsada:    ['sheets','mautic'],
      subscription_canceled: ['sheets'],
      subscription_renewed:  ['sheets','meta'],
    },
    active: true,
    created_at: '2026-03-11T18:04:00-03:00',
    stats: { '24h': 412, '7d': 2918, '30d': 9810, success_rate: 0.994 },
  },
  {
    id: 'd99fa120-aa31-4421-b8c4-bbdd44ff7788',
    name: 'Mentoria Bilíngue 360',
    token: 'mb360-evergreen',
    product_id: 'kw_prod_2bilng',
    product_name: 'Meu Filho Bilíngue 360',
    sheets_id: '1Mb360EvergrSheetsId_z2qPlk0aBcDeFgh',
    chatwoot_inbox_id: 9,
    chatwoot_tags: { compra_aprovada: ['aluno','mb360'] },
    mautic_segment_id: 30,
    mautic_tags: { compra_aprovada: ['comprador-mb360-evergreen'] },
    meta_templates: {},
    enabled_workers: {
      compra_aprovada:       ['sheets','chatwoot','mautic'],
      carrinho_abandonado:   ['sheets','chatwoot'],
      pix_gerado:            ['sheets'],
      boleto_gerado:         ['sheets'],
      compra_recusada:       ['sheets'],
      compra_reembolsada:    ['sheets','mautic'],
      subscription_canceled: ['sheets','mautic'],
      subscription_renewed:  ['sheets','mautic'],
    },
    active: false,
    created_at: '2026-01-08T11:30:00-03:00',
    stats: { '24h': 0, '7d': 184, '30d': 1820, success_rate: 0.961 },
  },
];

const NAMES = [
  'João Silva','Maria Oliveira','Pedro Santos','Ana Costa','Lucas Pereira','Fernanda Lima',
  'Rafael Souza','Juliana Alves','Bruno Martins','Camila Rodrigues','Gustavo Ferreira',
  'Beatriz Carvalho','Thiago Ribeiro','Larissa Almeida','Diego Fernandes','Patrícia Gomes',
  'Mateus Barbosa','Isabela Cardoso','Felipe Nunes','Aline Pinto','Rodrigo Castro',
  'Sabrina Moreira','Vinícius Araújo','Letícia Cavalcanti','Marcelo Dias','Renata Mendes',
];

const EMAILS_DOM = ['gmail.com','hotmail.com','outlook.com','yahoo.com.br','icloud.com','uol.com.br'];

const PRODUCTS = [
  { name: 'Black Belt em Gestão de Performance', value: 1997 },
  { name: 'Black Belt em Excel',                 value:  697 },
  { name: 'Imersão Copy Direto Vol. 4',          value: 2497 },
  { name: 'Meu Filho Bilíngue 360',              value:  497 },
];

const PAY_METHODS = ['credit_card','pix','billet'];

const ERROR_KINDS = [
  { service: 'meta',     code: 'rate_limited',       msg: 'Meta API: rate limit exceeded (60 req/min)' },
  { service: 'meta',     code: 'template_paused',    msg: 'Template `boas_vindas_dgpg02_v3` paused by Meta review' },
  { service: 'chatwoot', code: 'auth_failed',        msg: 'Chatwoot API: 401 invalid access token' },
  { service: 'chatwoot', code: 'contact_blocked',    msg: 'Contact #4821 is blocked, cannot add label' },
  { service: 'mautic',   code: 'oauth_token_expired',msg: 'Mautic OAuth2 token expired, refresh failed' },
  { service: 'sheets',   code: 'quota_exceeded',     msg: 'Google Sheets API: 429 read requests per minute' },
];

// ─── Pseudo-random with seed (deterministic) ───
let seed = 4242;
function rnd() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function pickInt(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }

function fakeEmail(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g, '.')
    .replace(/[^a-z.]/g,'')
    + (pickInt(0,99)) + '@' + pick(EMAILS_DOM);
}
function fakePhone() {
  const ddd = pickInt(11, 99);
  return `${ddd}9${pickInt(1000,9999)}${pickInt(1000,9999)}`;
}
function shortId() {
  const c = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 8; i++) s += c[Math.floor(rnd() * 16)];
  return s + '-' + Array.from({length:4}, () => c[Math.floor(rnd()*16)]).join('');
}

// ─── Build live jobs ───
function generateJobs(count) {
  const jobs = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const campaign = pick(CAMPAIGNS.filter(c => c.active));
    const event = pick(EVENTS);
    const enabledWorkers = campaign.enabled_workers[event.id] || [];
    const worker = pick(enabledWorkers.length ? enabledWorkers : ['sheets']);
    const name = pick(NAMES);
    const ageMs = pickInt(0, 1000 * 60 * 60 * 6); // up to 6h ago
    const r = rnd();
    let status;
    if (i < 4) status = 'active';
    else if (r < 0.78) status = 'completed';
    else if (r < 0.86) status = 'waiting';
    else if (r < 0.94) status = 'delayed';
    else status = 'failed';
    jobs.push({
      id: shortId(),
      campaign_id: campaign.id,
      campaign_token: campaign.token,
      event: event.id,
      worker,
      status,
      contact_name: name,
      contact_email: fakeEmail(name),
      duration_ms: status === 'active' ? null : pickInt(120, 2400),
      attempts: status === 'failed' ? pickInt(2,4) : (r < 0.9 ? 1 : pickInt(1,2)),
      ts: new Date(now - ageMs).toISOString(),
      error: status === 'failed' ? pick(ERROR_KINDS) : null,
    });
  }
  return jobs.sort((a,b) => new Date(b.ts) - new Date(a.ts));
}

// ─── DLQ items ───
function generateDlq(count) {
  const list = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const campaign = pick(CAMPAIGNS);
    const event = pick(EVENTS);
    const err = pick(ERROR_KINDS);
    const name = pick(NAMES);
    list.push({
      id: shortId(),
      campaign_name: campaign.name,
      campaign_token: campaign.token,
      event: event.id,
      worker: err.service,
      contact_name: name,
      contact_email: fakeEmail(name),
      error_code: err.code,
      error_msg: err.msg,
      attempts: 4,
      failed_at: new Date(now - pickInt(0, 1000 * 60 * 60 * 24 * 3)).toISOString(),
    });
  }
  return list.sort((a,b) => new Date(b.failed_at) - new Date(a.failed_at));
}

// ─── Unmatched events ───
function generateUnmatched(count) {
  const out = [];
  const now = Date.now();
  const badTokens = ['lf-vip03','expert-launch24','old-campaign-2024','typo-dgpgo2','test'];
  for (let i = 0; i < count; i++) {
    const t = pick(badTokens);
    const name = pick(NAMES);
    out.push({
      id: shortId(),
      token: t,
      payload: {
        order_id: shortId() + '-' + shortId(),
        order_status: pick(['paid','abandoned','pix_generated']),
        Customer: { name, email: fakeEmail(name), mobile: fakePhone() },
      },
      received_at: new Date(now - pickInt(0, 1000 * 60 * 60 * 48)).toISOString(),
    });
  }
  return out.sort((a,b) => new Date(b.received_at) - new Date(a.received_at));
}

// ─── Hourly throughput series (last 24h) ───
function generateThroughput() {
  const points = [];
  for (let i = 23; i >= 0; i--) {
    const base = 80 + Math.sin(i * 0.7) * 40 + rnd() * 60;
    const errors = Math.max(0, Math.floor(rnd() * 8 - 4));
    points.push({ hour: i, value: Math.floor(base), errors });
  }
  return points.reverse();
}

// ─── Live event timeline (top of queue) ───
function generateTimeline(count) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const campaign = pick(CAMPAIGNS.filter(c => c.active));
    const event = pick(EVENTS);
    const name = pick(NAMES);
    const r = rnd();
    const kind = r < 0.85 ? 'ok' : (r < 0.95 ? 'err' : 'new');
    out.push({
      id: shortId(),
      kind,
      campaign: campaign.token,
      event: event.id,
      contact: name,
      ts: new Date(now - i * pickInt(8_000, 90_000)).toISOString(),
    });
  }
  return out;
}

// ─── Global config ───
const GLOBAL_CONFIG = {
  chatwoot_url: 'https://chat.loyoladigital.com',
  chatwoot_token: 'cwt_********************************',
  chatwoot_account_id: '1',
  mautic_url: 'https://crm.loyoladigital.com',
  mautic_client_id: 'lh_prod_***',
  mautic_client_secret: '****************************',
  meta_token: 'EAAH****************************',
  meta_phone_number_id: '108839172234567',
  google_service_account: 'launchhub@loyola-prod.iam.gserviceaccount.com',
};

const RETRY_POLICY = [
  { attempt: 1, delay: 'imediato', label: '1ª tentativa' },
  { attempt: 2, delay: '30 segundos', label: '2ª tentativa' },
  { attempt: 3, delay: '5 minutos', label: '3ª tentativa' },
  { attempt: 4, delay: '30 minutos', label: '4ª tentativa' },
  { attempt: 5, delay: '—', label: 'dead letter queue' },
];

window.LH = {
  EVENTS, WORKERS, CAMPAIGNS, GLOBAL_CONFIG, RETRY_POLICY,
  PRODUCTS, PAY_METHODS, NAMES,
  generateJobs, generateDlq, generateUnmatched, generateThroughput, generateTimeline,
  fakeEmail, fakePhone, shortId, pick, pickInt, rnd,
};
