import { describe, it, expect } from 'vitest';
import { namesMatch } from './name-match';
import { AnonymizeLearnerSchema, AnonymizeProspectSchema } from './rgpd-schema';

describe('namesMatch', () => {
  it('matche exact', () => expect(namesMatch('Durand', 'Durand')).toBe(true));
  it('ignore casse et espaces', () => {
    expect(namesMatch('  durand ', 'Durand')).toBe(true);
    expect(namesMatch('DURAND', 'durand')).toBe(true);
  });
  it('refuse une saisie différente', () => expect(namesMatch('Dupont', 'Durand')).toBe(false));
  it('refuse une saisie vide', () => expect(namesMatch('   ', 'Durand')).toBe(false));
});

describe('schemas', () => {
  it('AnonymizeLearnerSchema exige uuid + confirmName', () => {
    expect(AnonymizeLearnerSchema.safeParse({ learnerId: 'x', confirmName: 'A' }).success).toBe(false);
    expect(AnonymizeLearnerSchema.safeParse({
      learnerId: '1ea50002-0000-0000-0000-000000000002', confirmName: 'Durand',
    }).success).toBe(true);
  });
  it('AnonymizeProspectSchema exige uuid + confirmName', () => {
    expect(AnonymizeProspectSchema.safeParse({
      prospectId: '9805c001-0000-0000-0000-000000000001', confirmName: 'Petit',
    }).success).toBe(true);
  });
});
