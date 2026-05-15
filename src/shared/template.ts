/**
 * Minimal templating engine for `{{path.to.value}}` substitution.
 *
 * - Resolves dotted paths against a plain-object context.
 * - Missing/null values resolve to empty string (so partial UTMs don't crash).
 * - Non-string scalars (numbers, booleans) are stringified.
 * - No conditionals, no loops, no filters. Intentionally tiny.
 *
 * Use for Mautic custom field values and any other user-configurable string.
 *
 * Example:
 *   render('Hello {{contact.name}}', { contact: { name: 'João' } })
 *   → 'Hello João'
 */
export type TemplateContext = Record<string, unknown>;

const TEMPLATE_RE = /\{\{\s*([^}\s]+)\s*\}\}/g;

function resolvePath(ctx: TemplateContext, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function scalarToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return ''; // arrays/objects → empty (avoid leaking "[object Object]")
}

export function render(template: string, ctx: TemplateContext): string {
  return template.replace(TEMPLATE_RE, (_match, path: string) =>
    scalarToString(resolvePath(ctx, path)),
  );
}

/**
 * Render every value of a Record. Keys are untouched.
 */
export function renderRecord(
  record: Record<string, string>,
  ctx: TemplateContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = render(v, ctx);
  }
  return out;
}
