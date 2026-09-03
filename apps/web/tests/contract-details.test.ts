// Le rédacteur IA a pour consigne de ne jamais inventer : ce qu'il ignore sort
// en « [à compléter] ». La saisie préalable ne vaut donc que si elle arrive
// jusqu'aux variables — et si un champ vide n'y produit PAS de variable, sans
// quoi le contrat afficherait une clause tronquée au lieu du marqueur.
import { describe, it, expect } from 'vitest';
import { contractDetailsSchema, contractVariables } from '@/features/trainers/contract-details';

describe('éléments du contrat de sous-traitance', () => {
  it('une saisie vide ne produit aucune variable', () => {
    const d = contractDetailsSchema.parse({});
    expect(Object.keys(contractVariables(d))).toEqual([]);
  });

  it('reprend les champs renseignés et laisse les autres de côté', () => {
    const d = contractDetailsSchema.parse({
      mission: 'Initiation Make, 2 jours, 8 stagiaires',
      startDate: '2026-10-05',
      feeAmount: '600 €',
      feeBasis: 'journalier',
      noticeDays: 30,
    });
    const v = contractVariables(d);
    expect(v['contrat_objet']).toContain('Initiation Make');
    expect(v['contrat_date_debut']).toBe('5 octobre 2026');
    expect(v['contrat_remuneration']).toBe('600 € (tarif journalier)');
    expect(v['contrat_preavis_jours']).toBe('30');
    expect(v['contrat_date_fin']).toBeUndefined();
    expect(v['contrat_tva']).toBeUndefined();
  });

  it('traduit le choix de propriété intellectuelle en clause', () => {
    const v = contractVariables(contractDetailsSchema.parse({ ipTerms: 'cession' }));
    expect(v['contrat_propriete_intellectuelle']).toMatch(/cède/i);
  });

  it('refuse une date mal formée', () => {
    expect(contractDetailsSchema.safeParse({ startDate: '05/10/2026' }).success).toBe(false);
  });

  it('accepte un préavis à zéro sans le confondre avec un champ vide', () => {
    const v = contractVariables(contractDetailsSchema.parse({ noticeDays: 0 }));
    expect(v['contrat_preavis_jours']).toBe('0');
  });
});
