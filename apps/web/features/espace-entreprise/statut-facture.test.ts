import { describe, expect, it } from 'vitest';
import { etatFacture } from './statut-facture';

const base = { kind: 'invoice', status: 'issued', totalCents: 100000, regleCents: 0, echeance: '2026-11-01' };

describe('facture vue par l’entreprise', () => {
  it('à régler avant l’échéance', () => expect(etatFacture(base, '2026-10-06')).toEqual({ statut: 'emise', resteCents: 100000 }));
  it('en retard après l’échéance', () => expect(etatFacture(base, '2026-11-02').statut).toBe('en_retard'));
  it('réglée en partie', () => expect(etatFacture({ ...base, regleCents: 40000 }, '2026-10-06')).toEqual({ statut: 'partielle', resteCents: 60000 }));
  it('réglée', () => expect(etatFacture({ ...base, status: 'paid' }, '2026-12-01')).toEqual({ statut: 'payee', resteCents: 0 }));
  it('un avoir ne se paie pas', () => expect(etatFacture({ ...base, kind: 'credit_note' }, '2026-12-01')).toEqual({ statut: 'payee', resteCents: 0 }));
});
