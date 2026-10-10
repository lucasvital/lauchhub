import { describe, it, expect } from 'vitest';
import {
  mapTallyContact,
  tallyHasEmail,
  extractTallyUtm,
  type TallyField,
  type TallyPayload,
} from '../../src/gateway/tally.js';

function payload(fields: TallyField[]): TallyPayload {
  return { eventType: 'FORM_RESPONSE', data: { formId: 'f1', formName: 'Form', fields } };
}

describe('mapTallyContact', () => {
  it('maps email/name/phone by field type', () => {
    const p = payload([
      { label: 'Qual seu nome?', type: 'INPUT_TEXT', value: 'André Luiz' },
      { label: 'E-mail', type: 'INPUT_EMAIL', value: 'adias28@gmail.com' },
      { label: 'WhatsApp', type: 'INPUT_PHONE_NUMBER', value: '+5531988486309' },
    ]);
    expect(mapTallyContact(p)).toMatchObject({
      name: 'André Luiz',
      email: 'adias28@gmail.com',
      phone: '+5531988486309',
    });
  });

  it('falls back to labels when types are generic', () => {
    const p = payload([
      { label: 'Nome completo', type: 'INPUT_TEXT', value: 'Maria' },
      { label: 'Seu melhor email', type: 'INPUT_TEXT', value: 'maria@x.com' },
      { label: 'Telefone', type: 'INPUT_TEXT', value: '31999999999' },
    ]);
    const c = mapTallyContact(p);
    expect(c.email).toBe('maria@x.com');
    expect(c.phone).toBe('31999999999');
    // name = first label match ("Nome completo")
    expect(c.name).toBe('Maria');
  });

  it('trims and handles array values', () => {
    const p = payload([
      { label: 'Email', type: 'INPUT_EMAIL', value: '  a@b.com  ' },
      { label: 'Interesses', type: 'CHECKBOXES', value: ['x', 'y'] },
    ]);
    expect(mapTallyContact(p).email).toBe('a@b.com');
  });
});

describe('tallyHasEmail', () => {
  it('true only when an email field has a value', () => {
    expect(tallyHasEmail(payload([{ label: 'Email', type: 'INPUT_EMAIL', value: 'a@b.com' }]))).toBe(true);
    expect(tallyHasEmail(payload([{ label: 'Nome', type: 'INPUT_TEXT', value: 'Zé' }]))).toBe(false);
    expect(tallyHasEmail({})).toBe(false);
  });
});

describe('extractTallyUtm', () => {
  it('reads utm_* from hidden fields', () => {
    const p = payload([
      { key: 'utm_source', label: 'utm_source', type: 'HIDDEN_FIELDS', value: 'instagram' },
      { key: 'utm_campaign', label: 'utm_campaign', type: 'HIDDEN_FIELDS', value: 'dg-h' },
    ]);
    const utm = extractTallyUtm(p);
    expect(utm.utm_source).toBe('instagram');
    expect(utm.utm_campaign).toBe('dg-h');
    expect(utm.utm_medium).toBeNull();
  });
});
