import { describe, expect, it } from 'vitest';
import { confirmationExigee, peutSupprimerFacture } from '../suppression-facture';

const emise = { reference: 'FAC-2026-O253GM', status: 'issued', provisoire: false };
const brouillon = { reference: 'PROV-AB12CD', status: 'draft', provisoire: true };

describe('supprimer une facture', () => {
  it('un brouillon part sans confirmation', () => {
    expect(confirmationExigee(brouillon)).toBe(false);
    expect(peutSupprimerFacture(brouillon, null).ok).toBe(true);
  });
  it('une facture émise exige son numéro retapé', () => {
    expect(peutSupprimerFacture(emise, null)).toEqual({ ok: false, error: 'confirmation_requise' });
    expect(peutSupprimerFacture(emise, 'FAC-2026-XXXX')).toEqual({ ok: false, error: 'confirmation_incorrecte' });
    expect(peutSupprimerFacture(emise, ' fac-2026-o253gm ').ok).toBe(true);
  });
  it('payée ou annulée : même exigence', () => {
    expect(confirmationExigee({ ...emise, status: 'paid' })).toBe(true);
    expect(confirmationExigee({ ...emise, status: 'cancelled' })).toBe(true);
  });
});
