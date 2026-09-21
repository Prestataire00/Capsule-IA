import { describe, it, expect } from 'vitest';
import { etatFinancement, resumeFinancement, estStatutFinancement, tonStatut } from './prise-en-charge';

const ligne = (status: string, amountCents: number, grantedCents: number | null = null) => ({
  status,
  amountCents,
  grantedCents,
});

describe('reste à payer', () => {
  it('sans financeur, le client règle tout', () => {
    const e = etatFinancement(210000, []);
    expect(e.resteAPayerCents).toBe(210000);
    expect(e.sansFinanceur).toBe(true);
    expect(resumeFinancement(e)).toContain('Aucun financeur');
  });

  it('tant que l’OPCO n’a pas répondu, rien n’est acquis', () => {
    // Le piège : compter le demandé comme acquis fait croire à une prise en
    // charge qui n'existe pas encore, et la facture part fausse.
    const e = etatFinancement(210000, [ligne('submitted', 180000)]);
    expect(e.acquisCents).toBe(0);
    expect(e.enAttenteCents).toBe(180000);
    expect(e.resteAPayerCents).toBe(210000);
    expect(e.resteSiToutAccordeCents).toBe(30000);
    expect(e.enAttenteDeReponse).toBe(true);
  });

  it('à l’accord, c’est le montant accordé qui fait foi, pas le demandé', () => {
    const e = etatFinancement(210000, [ligne('approved', 180000, 150000)]);
    expect(e.acquisCents).toBe(150000);
    expect(e.resteAPayerCents).toBe(60000);
  });

  it('un accord sans montant chiffré retient le demandé', () => {
    const e = etatFinancement(210000, [ligne('approved', 180000, null)]);
    expect(e.acquisCents).toBe(180000);
    expect(e.resteAPayerCents).toBe(30000);
  });

  it('un refus retombe entièrement sur le client', () => {
    const e = etatFinancement(210000, [ligne('refused', 180000)]);
    expect(e.acquisCents).toBe(0);
    expect(e.refuseCents).toBe(180000);
    expect(e.resteAPayerCents).toBe(210000);
    expect(e.enAttenteDeReponse).toBe(false);
    expect(resumeFinancement(e)).toContain('Aucune prise en charge');
  });

  it('additionne plusieurs financeurs', () => {
    const e = etatFinancement(300000, [ligne('paid', 100000, 100000), ligne('approved', 120000, 90000), ligne('refused', 50000)]);
    expect(e.acquisCents).toBe(190000);
    expect(e.resteAPayerCents).toBe(110000);
  });

  it('une prise en charge intégrale ne laisse rien à payer', () => {
    const e = etatFinancement(210000, [ligne('approved', 210000, 210000)]);
    expect(e.resteAPayerCents).toBe(0);
    expect(resumeFinancement(e)).toBe('Intégralement pris en charge.');
  });

  it('un financeur plus généreux que prévu ne crée pas de dette envers le client', () => {
    const e = etatFinancement(100000, [ligne('approved', 120000, 120000)]);
    expect(e.resteAPayerCents).toBe(0);
  });

  it('résiste à un total absent ou aberrant', () => {
    expect(etatFinancement(null, []).resteAPayerCents).toBe(0);
    expect(etatFinancement(undefined, [ligne('approved', 5000, 5000)]).resteAPayerCents).toBe(0);
    expect(etatFinancement(-1, []).resteAPayerCents).toBe(0);
  });
});

describe('statuts', () => {
  it('n’accepte que les valeurs de la base', () => {
    for (const v of ['pending', 'submitted', 'approved', 'refused', 'paid']) expect(estStatutFinancement(v)).toBe(true);
    for (const v of ['valide', 'ok', '', 'APPROVED']) expect(estStatutFinancement(v)).toBe(false);
  });

  it('donne une couleur qui dit l’état sans lire le texte', () => {
    expect(tonStatut('approved')).toBe('success');
    expect(tonStatut('paid')).toBe('success');
    expect(tonStatut('refused')).toBe('danger');
    expect(tonStatut('submitted')).toBe('warning');
    expect(tonStatut('pending')).toBe('neutral');
  });
});
