import { describe, it, expect } from 'vitest';
import { slugify, toInsert, fromRow, type FormationRowLike } from './mapping';
import { emptyFormationValues, type FormationFormValues } from './formation.schema';

describe('slugify', () => {
  it('normalise accents, espaces et casse', () => {
    expect(slugify('FORM Compta 01')).toBe('form-compta-01');
    expect(slugify('Sécurité & Prévention')).toBe('securite-prevention');
    expect(slugify('  --Trim--  ')).toBe('trim');
  });
  it('retombe sur "formation" si vide', () => {
    expect(slugify('!!!')).toBe('formation');
  });
});

const ctx = { organizationId: 'org-1', userId: 'user-1' };

const filled: FormationFormValues = {
  ...emptyFormationValues,
  title: 'Initiation comptabilité',
  subtitle: 'Niveau 1',
  code: 'FORM-COMPTA-01',
  description: '<p>Desc</p>',
  modality: 'distanciel',
  durationHours: '14',
  durationDays: '2',
  effectifMin: '4',
  effectifMax: '12',
  status: 'published',
  priceBase: '500',
  priceEntreprise: '900',
  priceParticulier: '750.5',
  categories: ['Comptabilité / Gestion'],
  eligibleCpf: true,
  certifying: true,
  validityValue: '4',
  validityUnit: 'annees',
  recyclingEnabled: true,
  recyclingReminderValue: '6',
  recyclingReminderUnit: 'mois',
  certifType: 'rncp',
  rncpCode: 'RNCP123',
  certificateur: 'France Compétences',
  objectives: ['Comprendre le bilan', 'Saisir des écritures'],
  prerequisites: ['Aucun'],
  evaluationMethod: '<p>QCM</p>',
  fundingTypes: ['cpf', 'opco'],
};

describe('toInsert', () => {
  it('mappe les colonnes connues + euros→cents + is_published', () => {
    const row = toInsert(filled, ctx);
    expect(row.organization_id).toBe('org-1');
    expect(row.created_by).toBe('user-1');
    expect(row.title).toBe('Initiation comptabilité');
    expect(row.code).toBe('FORM-COMPTA-01');
    expect(row.slug).toBe('form-compta-01');
    expect(row.summary).toBe('Niveau 1');
    expect(row.default_modality).toBe('distanciel');
    expect(row.default_duration_hours).toBe(14);
    expect(row.default_price_cents).toBe(50000);
    expect(row.is_published).toBe(true);
    expect(row.objectives).toEqual(['Comprendre le bilan', 'Saisir des écritures']);
    expect(row.rncp_code).toBe('RNCP123');
  });

  it('range les extras dans metadata.catalog', () => {
    const row = toInsert(filled, ctx);
    expect(row.metadata.catalog.priceEntrepriseCents).toBe(90000);
    expect(row.metadata.catalog.priceParticulierCents).toBe(75050);
    expect(row.metadata.catalog.eligibleCpf).toBe(true);
    expect(row.metadata.catalog.recyclingEnabled).toBe(true);
    expect(row.metadata.catalog.fundingTypes).toEqual(['cpf', 'opco']);
  });

  it('génère un code depuis le titre si code vide', () => {
    const row = toInsert({ ...filled, code: '' }, ctx);
    expect(row.code).toBe('initiation-comptabilite');
    expect(row.slug).toBe('initiation-comptabilite');
  });
});

describe('round-trip fromRow(toInsert(...))', () => {
  it('redonne les valeurs saisies', () => {
    const inserted = toInsert(filled, ctx);
    // La ligne DB lue a la même forme (colonnes + metadata) que l'insert.
    const back = fromRow(inserted as unknown as FormationRowLike);
    expect(back).toEqual(filled);
  });

  it('formulaire minimal → insert → relecture (status draft, prix 0)', () => {
    const base: FormationFormValues = { ...emptyFormationValues, title: 'X', durationHours: '7' };
    const back = fromRow(toInsert(base, ctx) as unknown as FormationRowLike);
    expect(back.status).toBe('draft');
    expect(back.durationHours).toBe('7');
    // priceBase vide → colonne NOT NULL DEFAULT 0 → relu en '0'
    expect(back.priceBase).toBe('0');
  });
});

describe('tarifs HT / TTC', () => {
  const ttc = (over: Partial<FormationFormValues> = {}): FormationFormValues => ({
    ...emptyFormationValues,
    title: 'Formation IA',
    durationHours: '7',
    priceMode: 'ttc',
    priceVatRate: '20',
    priceBase: '1200',
    priceEntreprise: '1440',
    ...over,
  });

  it('convertit une saisie TTC en HT avant enregistrement', () => {
    const row = toInsert(ttc(), ctx);
    // 1 200 € TTC à 20 % = 1 000 € HT
    expect(row.default_price_cents).toBe(100000);
    expect(row.metadata.catalog.priceEntrepriseCents).toBe(120000);
    expect(row.metadata.catalog.priceMode).toBe('ttc');
    expect(row.metadata.catalog.priceVatRate).toBe(20);
  });

  it('laisse une saisie HT intacte, taux ou pas', () => {
    const row = toInsert(ttc({ priceMode: 'ht' }), ctx);
    expect(row.default_price_cents).toBe(120000);
  });

  it('ignore le mode TTC quand le taux est nul (organisme exonéré)', () => {
    const row = toInsert(ttc({ priceVatRate: '0' }), ctx);
    expect(row.default_price_cents).toBe(120000);
  });

  it('ré-affiche le formulaire dans l’unité de saisie', () => {
    const row = toInsert(ttc(), ctx);
    const back = fromRow({
      ...(row as unknown as FormationRowLike),
      default_price_cents: row.default_price_cents,
    });
    expect(back.priceMode).toBe('ttc');
    expect(back.priceBase).toBe('1200');
    expect(back.priceEntreprise).toBe('1440');
  });
});
