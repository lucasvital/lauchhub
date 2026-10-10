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

  it('resolves choice option ids to their text', () => {
    const p = payload([
      {
        label: 'nome',
        type: 'MULTIPLE_CHOICE',
        value: ['2beea7f4'],
        options: [
          { id: '2beea7f4', text: 'Masculino' },
          { id: '51232be5', text: 'Feminino' },
        ],
      },
    ]);
    // the value is an option id and must resolve to the option text, not the raw id
    expect(mapTallyContact(p).name).toBe('Masculino');
  });

  it('returns no email when the hidden contact fields are null (real Tally lead form)', () => {
    const p = payload([
      { key: 'q1', label: 'Qual é seu sexo?', type: 'MULTIPLE_CHOICE', value: ['id1'], options: [{ id: 'id1', text: 'M' }] },
      { key: 'h_nome', label: 'nome', type: 'HIDDEN_FIELDS', value: null },
      { key: 'h_email', label: 'email', type: 'HIDDEN_FIELDS', value: null },
      { key: 'h_tel', label: 'telefone', type: 'HIDDEN_FIELDS', value: null },
    ]);
    expect(mapTallyContact(p).email).toBeNull();
    expect(tallyHasEmail(p)).toBe(false);
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
