import { describe, it, expect } from 'vitest';
import { appliquerGrille, lignesDevis, scenarios, totalHtCents } from '../contenu';
import { GRILLE_PAR_DEFAUT } from '@/features/billing/grille-tarifaire';
import { propositionSolutionsTerrain as contenuValide } from './fixture';

const sansPrix = (participants: number) => {
  const c = contenuValide();
  return { ...c, tarif: { ...c.tarif, prix_unitaire_cents: 0, heures: 7, participants, scenarios_participants: [2, 6, 11] } };
};

describe('proposition chiffrée par la grille', () => {
  it('sans prix, prend le tarif de l’effectif retenu', () => {
    const c = appliquerGrille(sansPrix(4), GRILLE_PAR_DEFAUT, 6);
    expect(c.tarif).toMatchObject({ mode: 'heure_apprenant', prix_unitaire_cents: 6000, participants: 4 });
    expect(totalHtCents(c.tarif)).toBe(6000 * 7 * 4);
  });

  it('le tableau des scénarios est dégressif', () => {
    const c = appliquerGrille(sansPrix(4), GRILLE_PAR_DEFAUT, 6);
    expect(scenarios(c.tarif).map((s) => s.totalCents)).toEqual([24000 * 7, 24000 * 7, 24000 * 7, 3500 * 11 * 7]);
  });

  it('la ligne du devis tombe juste sur le total annoncé', () => {
    const c = appliquerGrille(sansPrix(4), GRILLE_PAR_DEFAUT, 6);
    const [ligne] = lignesDevis(c);
    expect(Math.round(ligne!.quantite * ligne!.prixUnitaireCents)).toBe(totalHtCents(c.tarif));
  });

  it('un prix négocié (tiré des notes) reste tel quel', () => {
    const c = contenuValide();
    const negocie = { ...c, tarif: { ...c.tarif, mode: 'heure_apprenant' as const, prix_unitaire_cents: 3000, participants: 4 } };
    expect(appliquerGrille(negocie, GRILLE_PAR_DEFAUT, 6)).toBe(negocie);
  });
});
