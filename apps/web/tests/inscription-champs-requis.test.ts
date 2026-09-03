import { describe, it, expect } from 'vitest';
import { prospectFieldsSchema, siretValide, telephoneValide } from '@/app/inscription/schema';

const base = {
  firstName: 'Léa', lastName: 'Martin', email: 'lea@example.com',
  rqth: false, situation: 'salarie' as const, funderKinds: ['opco' as const],
};

describe('inscription — champs obligatoires', () => {
  it('refuse un salarié sans téléphone', () => {
    expect(prospectFieldsSchema.safeParse({ ...base, phone: '', companySiret: '12345678900012' }).success).toBe(false);
  });
  it('refuse un salarié sans SIRET', () => {
    expect(prospectFieldsSchema.safeParse({ ...base, phone: '0612345678', companySiret: '' }).success).toBe(false);
  });
  it('refuse un SIRET mal formé', () => {
    expect(prospectFieldsSchema.safeParse({ ...base, phone: '0612345678', companySiret: '123' }).success).toBe(false);
  });
  it('accepte un salarié complet, SIRET avec espaces', () => {
    expect(prospectFieldsSchema.safeParse({ ...base, phone: '06 12 34 56 78', companySiret: '123 456 789 00012' }).success).toBe(true);
  });
  it('n’exige pas de SIRET d’un particulier', () => {
    expect(prospectFieldsSchema.safeParse({ ...base, situation: 'particulier', phone: '0612345678', companySiret: '' }).success).toBe(true);
  });
  it('n’exige pas de SIRET d’un indépendant ni d’un demandeur d’emploi', () => {
    for (const situation of ['independant', 'demandeur'] as const) {
      expect(prospectFieldsSchema.safeParse({ ...base, situation, phone: '0612345678', companySiret: '' }).success).toBe(true);
    }
  });
  it('valide les formats', () => {
    expect(siretValide('123 456 789 00012')).toBe(true);
    expect(siretValide('12345')).toBe(false);
    expect(telephoneValide('06 12 34 56 78')).toBe(true);
    expect(telephoneValide('abc')).toBe(false);
  });
});
