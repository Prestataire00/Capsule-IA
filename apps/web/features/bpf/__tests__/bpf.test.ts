import { describe, it, expect } from 'vitest';
import {
  funderKindToBpfLine,
  invoiceToBpfLine,
  buildBpfFinancial,
  buildBpfCharges,
  depensesDeLAnnee,
  type DepenseBpf,
} from '../bpf';

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

describe('quelles charges entrent dans l’exercice', () => {
  const dep = (over: Partial<DepenseBpf> = {}): DepenseBpf => ({
    kind: 'autre',
    amountCents: 1000,
    hours: null,
    incurredOn: null,
    rattachementOn: null,
    ...over,
  });

  it('retient une charge datée dans l’année', () => {
    const t = depensesDeLAnnee([dep({ incurredOn: '2026-06-15' })], '2026-01-01', '2026-12-31');
    expect(t.retenues).toHaveLength(1);
    expect(t.sansAnnee).toHaveLength(0);
  });

  it('écarte une charge datée hors de l’année', () => {
    const t = depensesDeLAnnee([dep({ incurredOn: '2025-12-31' })], '2026-01-01', '2026-12-31');
    expect(t.retenues).toHaveLength(0);
    expect(t.sansAnnee).toHaveLength(0);
  });

  it('rattache par l’objet porteur quand la charge n’est pas datée', () => {
    // Une dépense de séance sans date se rattache à la date de la séance.
    const t = depensesDeLAnnee([dep({ rattachementOn: '2026-03-02' })], '2026-01-01', '2026-12-31');
    expect(t.retenues).toHaveLength(1);
  });

  it('fait primer la date de la charge sur celle de l’objet', () => {
    const t = depensesDeLAnnee(
      [dep({ incurredOn: '2025-11-02', rattachementOn: '2026-03-02' })],
      '2026-01-01',
      '2026-12-31',
    );
    expect(t.retenues).toHaveLength(0);
  });

  it('ne range PAS une charge sans aucune date dans l’année en cours', () => {
    // Sinon elle gonflerait chaque exercice à tour de rôle.
    const t = depensesDeLAnnee([dep()], '2026-01-01', '2026-12-31');
    expect(t.retenues).toHaveLength(0);
    expect(t.sansAnnee).toHaveLength(1);
  });

  it('ventile ensuite normalement ce qui a été retenu', () => {
    const t = depensesDeLAnnee(
      [
        dep({ kind: 'salaire_formateur', amountCents: 50000, incurredOn: '2026-02-01' }),
        dep({ kind: 'sous_traitance_confiee', amountCents: 30000, hours: 7, rattachementOn: '2026-05-01' }),
        dep({ kind: 'achat_formation', amountCents: 10000, incurredOn: '2027-01-01' }),
      ],
      '2026-01-01',
      '2026-12-31',
    );
    const c = buildBpfCharges(t.retenues);
    expect(c.salairesFormateursCents).toBe(50000);
    expect(c.sousTraitanceConfieeCents).toBe(30000);
    expect(c.sousTraitanceConfieeHeures).toBe(7);
    expect(c.achatsFormationCents).toBe(0);
    expect(c.totalCents).toBe(80000);
  });
});
