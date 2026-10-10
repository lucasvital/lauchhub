import type { ContactInfo, UtmInfo } from '../types/job.js';

/**
 * Tally webhook payload (eventType "FORM_RESPONSE"). We only need the
 * respondent's identity (name/email/phone) — pulled from `data.fields`, which
 * is an array of { key, label, type, value } entries. Hidden fields carrying
 * utm_* are also read when present.
 *
 * Docs shape (abridged):
 *   { eventType, data: { formId, formName, fields: [ {label,type,value}, … ] } }
 */
export interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
}

export interface TallyPayload {
  eventType?: string;
  data?: {
    formId?: string;
    formName?: string;
    respondentId?: string;
    submissionId?: string;
    fields?: TallyField[];
  };
}

/** Coerce a Tally field value (string | number | array | option) to a string. */
function fieldValue(f: TallyField): string {
  const v = f.value;
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join(', ').trim();
  return String(v).trim();
}

function fieldsOf(payload: TallyPayload): TallyField[] {
  return Array.isArray(payload.data?.fields) ? payload.data!.fields! : [];
}

function byType(fields: TallyField[], type: string): string {
  for (const f of fields) {
    if ((f.type ?? '').toUpperCase() === type) {
      const v = fieldValue(f);
      if (v) return v;
    }
  }
  return '';
}

function byLabel(fields: TallyField[], keywords: string[]): string {
  for (const f of fields) {
    const label = (f.label ?? '').toLowerCase();
    const key = (f.key ?? '').toLowerCase();
    if (keywords.some((k) => label.includes(k) || key.includes(k))) {
      const v = fieldValue(f);
      if (v) return v;
    }
  }
  return '';
}

/** Build the canonical contact from a Tally submission (best-effort field mapping). */
export function mapTallyContact(payload: TallyPayload): ContactInfo {
  const fields = fieldsOf(payload);
  const email =
    byType(fields, 'INPUT_EMAIL') || byLabel(fields, ['e-mail', 'email', 'mail']) || null;
  const name =
    byLabel(fields, ['nome', 'name']) || byType(fields, 'INPUT_TEXT') || '';
  const phone =
    byType(fields, 'INPUT_PHONE_NUMBER') ||
    byLabel(fields, ['telefone', 'whatsapp', 'celular', 'phone', 'fone', 'tel']) ||
    null;
  const instagram = byLabel(fields, ['instagram', '@']) || null;
  const city = byLabel(fields, ['cidade', 'city']) || null;

  return { name, email, phone, instagram, city };
}

/** True when the submission carries an email — Mautic requires it. */
export function tallyHasEmail(payload: TallyPayload): boolean {
  return Boolean(mapTallyContact(payload).email);
}

const EMPTY_UTM: UtmInfo = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  sck: null,
  utm_id: null,
};

/** Read utm_* from Tally hidden fields (by key/label), if the form passes them. */
export function extractTallyUtm(payload: TallyPayload): UtmInfo {
  const fields = fieldsOf(payload);
  const pick = (name: string): string | null => byLabel(fields, [name]) || null;
  return {
    ...EMPTY_UTM,
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_content: pick('utm_content'),
    utm_term: pick('utm_term'),
  };
}
