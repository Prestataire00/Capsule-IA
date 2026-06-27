import { describe, it, expect } from 'vitest';
import { funderKindToBpfLine, invoiceToBpfLine, buildBpfFinancial } from '../bpf';

describe('funderKindToBpfLine', () => {
  it('mappe les types de financeur sur les lignes BPF', () => {
    expect(funderKindToBpfLine('opco')).toBe('opco');
    expect(funderKindToBpfLine('cpf')).toBe('cpf');
    expect(funderKindToBpfLine('region')).toBe('region');
    expect(funderKindToBpfLine('pole_emploi')).toBe('france_travail');
    expect(funderKindToBpfLine('entreprise')).toBe('entreprises');
    expect(funderKindToBpfLine('autofinancement')).toBe('particuliers');
    expect(funderKindToBpfLine('autre')).toBe('autres');
    expect(funderKindToBpfLine(null)).toBe('autres');
  });
});

describe('invoiceToBpfLine', () => {
  it('utilise le financeur si présent', () => {
    expect(invoiceToBpfLine({ subtotalHtCents: 0, funderKind: 'opco', hasCompany: true, status: 'issued' })).toBe('opco');
  });
  it('sans financeur : entreprise → B-1, sinon particulier → B-4', () => {
    expect(invoiceToBpfLine({ subtotalHtCents: 0, funderKind: null, hasCompany: true, status: 'issued' })).toBe('entreprises');
    expect(invoiceToBpfLine({ subtotalHtCents: 0, funderKind: null, hasCompany: false, status: 'issued' })).toBe('particuliers');
  });
});

describe('buildBpfFinancial', () => {
  it('ventile les produits HT et ignore brouillons/annulées', () => {
    const r = buildBpfFinancial([
      { subtotalHtCents: 200_000, funderKind: 'opco', hasCompany: true, status: 'issued' },
      { subtotalHtCents: 100_000, funderKind: 'cpf', hasCompany: false, status: 'paid' },
      { subtotalHtCents: 50_000, funderKind: null, hasCompany: true, status: 'issued' },
      { subtotalHtCents: 999_999, funderKind: 'opco', hasCompany: true, status: 'draft' }, // ignorée
      { subtotalHtCents: 999_999, funderKind: 'opco', hasCompany: true, status: 'cancelled' }, // ignorée
    ]);
    expect(r.lines.opco).toBe(200_000);
    expect(r.lines.cpf).toBe(100_000);
    expect(r.lines.entreprises).toBe(50_000);
    expect(r.totalCents).toBe(350_000);
  });
});
