import { describe, it, expect } from 'vitest';
import { render, renderRecord } from '../../src/shared/template.js';

describe('render', () => {
  it('resolves simple paths', () => {
    expect(render('Hello {{name}}', { name: 'João' })).toBe('Hello João');
  });

  it('resolves nested paths', () => {
    expect(render('{{contact.email}}', { contact: { email: 'a@b.com' } })).toBe('a@b.com');
  });

  it('handles deep paths', () => {
    expect(render('{{a.b.c.d}}', { a: { b: { c: { d: 'deep' } } } })).toBe('deep');
  });

  it('emits empty string for missing paths', () => {
    expect(render('utm={{utm.utm_source}}', { utm: {} })).toBe('utm=');
  });

  it('emits empty string for null values', () => {
    expect(render('{{order.ref}}', { order: { ref: null } })).toBe('');
  });

  it('stringifies numbers and booleans', () => {
    expect(render('points={{points}} ok={{ok}}', { points: 3, ok: true })).toBe('points=3 ok=true');
  });

  it('emits empty for arrays/objects to avoid [object Object]', () => {
    expect(render('{{a}}', { a: [1, 2] })).toBe('');
    expect(render('{{a}}', { a: { x: 1 } })).toBe('');
  });

  it('handles multiple substitutions in one string', () => {
    expect(render('{{a}} and {{b}}', { a: '1', b: '2' })).toBe('1 and 2');
  });

  it('preserves non-template text', () => {
    expect(render('static text only', { x: 1 })).toBe('static text only');
  });

  it('tolerates whitespace inside braces', () => {
    expect(render('{{  contact.name  }}', { contact: { name: 'Ana' } })).toBe('Ana');
  });

  it('does not expand without exact double-brace', () => {
    expect(render('{name} {{name}}', { name: 'X' })).toBe('{name} X');
  });
});

describe('renderRecord', () => {
  it('renders every value, leaves keys untouched', () => {
    const out = renderRecord(
      { points: '3', utmsource: '{{utm.utm_source}}' },
      { utm: { utm_source: 'whatsapp' } },
    );
    expect(out).toEqual({ points: '3', utmsource: 'whatsapp' });
  });

  it('handles empty record', () => {
    expect(renderRecord({}, {})).toEqual({});
  });
});
