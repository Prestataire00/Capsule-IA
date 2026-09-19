import { describe, it, expect } from 'vitest';
import {
  montantCouvertCents,
  manqueCents,
  estAcquis,
  estDecide,
  estStatutFinancement,
  STATUT_LABELS,
} from '../funding-status';

describe('ce qu’un financeur couvre réellement', () => {
  it('ne couvre RIEN quand la prise en charge est refusée', () => {
    expect(montantCouvertCents('refused', 120000, null)).toBe(0);
    // Même si un montant avait été saisi avant le refus.
    expect(montantCouvertCents('refused', 120000, 90000)).toBe(0);
  });

  it('retient le montant accordé, pas le demandé', () => {
    expect(montantCouvertCents('approved', 120000, 90000)).toBe(90000);
    expect(montantCouvertCents('paid', 120000, 90000)).toBe(90000);
  });

  it('vaut accord du demandé quand l’accord ne chiffre rien', () => {
    expect(montantCouvertCents('approved', 120000, null)).toBe(120000);
  });

  it('travaille sur le demandé tant qu’aucune réponse n’est arrivée', () => {
    expect(montantCouvertCents('pending', 120000, null)).toBe(120000);
    expect(montantCouvertCents('submitted', 120000, null)).toBe(120000);
  });

  it('ne rend jamais un montant négatif', () => {
    expect(montantCouvertCents('approved', -5, -10)).toBe(0);
    expect(montantCouvertCents('pending', -5, null)).toBe(0);
  });
});

describe('engagement du financeur', () => {
  it('distingue l’espéré de l’acquis', () => {
    expect(estAcquis('pending')).toBe(false);
    expect(estAcquis('submitted')).toBe(false);
    expect(estAcquis('approved')).toBe(true);
    expect(estAcquis('paid')).toBe(true);
    expect(estAcquis('refused')).toBe(false);
  });

  it('sait quand une décision a été rendue', () => {
    expect(estDecide('submitted')).toBe(false);
    expect(estDecide('refused')).toBe(true);
  });
});

describe('ce qui retombe sur le client', () => {
  it('chiffre le manque après une prise en charge partielle', () => {
    expect(manqueCents('approved', 120000, 90000)).toBe(30000);
  });

  it('compte la totalité après un refus', () => {
    expect(manqueCents('refused', 120000, null)).toBe(120000);
  });

  it('n’annonce aucun manque tant que le financeur n’a pas répondu', () => {
    expect(manqueCents('submitted', 120000, null)).toBe(0);
    expect(manqueCents('pending', 120000, null)).toBe(0);
  });

  it('n’annonce aucun manque quand tout est accordé', () => {
    expect(manqueCents('approved', 120000, 120000)).toBe(0);
  });
});

describe('valeurs venues de la base', () => {
  it('rejette un statut inconnu', () => {
    expect(estStatutFinancement('approved')).toBe(true);
    expect(estStatutFinancement('en_cours')).toBe(false);
    expect(estStatutFinancement(null)).toBe(false);
  });

  it('nomme chaque statut en français', () => {
    expect(STATUT_LABELS.refused).toBe('Refus');
    expect(STATUT_LABELS.submitted).toMatch(/attente/i);
  });
});
