import { describe, expect, it } from 'vitest';
import { coordonneesApprenantSchema } from './coordonnees.schema';

const id = '00000000-0000-4000-8000-000000000001';

describe('coordonnées saisies par l’entreprise', () => {
  it('accepte un e-mail et un téléphone, ou des champs vides', () => {
    expect(coordonneesApprenantSchema.safeParse({ learnerId: id, email: 'lea@acme.fr', telephone: '06 12 34 56 78' }).success).toBe(true);
    expect(coordonneesApprenantSchema.safeParse({ learnerId: id, email: '', telephone: '' }).success).toBe(true);
  });
  it('refuse une adresse ou un numéro mal formés', () => {
    expect(coordonneesApprenantSchema.safeParse({ learnerId: id, email: 'lea@', telephone: '' }).success).toBe(false);
    expect(coordonneesApprenantSchema.safeParse({ learnerId: id, email: '', telephone: 'abc' }).success).toBe(false);
  });
});
