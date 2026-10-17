import { describe, expect, it } from 'vitest';
import { encaissement, impayeAAfficher } from '../encaissement';

const f = (status: string, total: number, paye = 0, kind = 'invoice') => ({ status, kind, totalCents: total, payeCents: paye });

describe('encaissement d’un dossier', () => {
  it('rien de facturé : le montant du dossier reste dû', () => {
    expect(encaissement({ totalDossierCents: 500000, factures: [f('draft', 500000)], regleHorsCrm: false })).toMatchObject({ resteCents: 500000, aFacturer: true });
  });
  it('facturé, en partie payé', () => {
    expect(encaissement({ totalDossierCents: 500000, factures: [f('partially_paid', 600000, 200000)], regleHorsCrm: false })).toMatchObject({ resteCents: 400000, encaisseCents: 200000 });
  });
  it('un avoir réduit le dû', () => {
    expect(encaissement({ totalDossierCents: 500000, factures: [f('issued', 600000), f('issued', 600000, 0, 'credit_note')], regleHorsCrm: false }).resteCents).toBe(0);
  });
  it('réglé hors Capsule (Qonto) : plus rien de dû', () => {
    expect(encaissement({ totalDossierCents: 500000, factures: [], regleHorsCrm: true }).resteCents).toBe(0);
  });
  it('rouge seulement une fois le dossier fini', () => {
    const e = encaissement({ totalDossierCents: 500000, factures: [], regleHorsCrm: false });
    expect(impayeAAfficher(e, { status: 'active', endDate: '2026-12-01' }, '2026-10-17')).toBe(false);
    expect(impayeAAfficher(e, { status: 'completed', endDate: '2026-12-01' }, '2026-10-17')).toBe(true);
    expect(impayeAAfficher(e, { status: 'active', endDate: '2026-10-01' }, '2026-10-17')).toBe(true);
    expect(impayeAAfficher(e, { status: 'cancelled', endDate: '2026-10-01' }, '2026-10-17')).toBe(false);
  });
});
