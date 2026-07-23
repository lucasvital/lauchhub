/**
 * Date/time helpers.
 *
 * The gateway stamps `received_at` in UTC ISO (`2026-07-21T11:59:01.466Z`) so
 * the internal record stays unambiguous. For the Sheets "Data Criação" column
 * the operator wants the local São Paulo wall-clock instead.
 */

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Format a UTC ISO timestamp as the São Paulo local wall-clock,
 * `YYYY-MM-DD HH:mm:ss` (24h). Falls back to a fixed UTC-3 offset if the
 * runtime lacks ICU timezone data (São Paulo has had no DST since 2019).
 * Returns the input unchanged if it is not a parseable date.
 */
export function formatSaoPaulo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    if (p.year && p.month && p.day && p.hour != null) {
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    }
  } catch {
    /* fall through to manual offset */
  }

  // Fallback: São Paulo is UTC-3 (no DST since 2019).
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${sp.getUTCFullYear()}-${pad(sp.getUTCMonth() + 1)}-${pad(sp.getUTCDate())} ` +
    `${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}:${pad(sp.getUTCSeconds())}`
  );
}
