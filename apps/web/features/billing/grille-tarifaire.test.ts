import { describe, it, expect } from 'vitest';
import { GRILLE_PAR_DEFAUT, lireGrille, prixParDefaut, prixSelonGrille, tableauGrille } from './grille-tarifaire';

describe('grille d’Anissa', () => {
  const horaire = (n: number) => prixSelonGrille(GRILLE_PAR_DEFAUT, { stagiaires: n, heures: 1 }).horaireParStagiaireCents;

  it('reproduit le tableau : dégressif par tête, plancher de 240 €/h', () => {
    expect([2, 3, 4, 5, 6, 7, 10, 11, 15].map(horaire)).toEqual([12000, 8000, 6000, 4800, 4000, 4000, 4000, 3500, 3500]);
  });

  it('CA horaire de séance : 240 € jusqu’à 6, puis 40 € par tête, 35 € dès 11', () => {
    const lignes = tableauGrille(GRILLE_PAR_DEFAUT, [2, 6, 7, 10, 11]);
    expect(lignes.map((l) => l.horaireSessionCents)).toEqual([24000, 24000, 28000, 40000, 38500]);
    expect(lignes.map((l) => l.margeHoraireCents)).toEqual([19000, 19000, 23000, 35000, 33500]);
  });

  it('un stagiaire seul paie le plancher', () => {
    expect(horaire(1)).toBe(24000);
  });

  it('total = horaire × stagiaires × heures, et signale le plancher', () => {
    expect(prixSelonGrille(GRILLE_PAR_DEFAUT, { stagiaires: 4, heures: 14 })).toEqual({
      horaireParStagiaireCents: 6000,
      horaireSessionCents: 24000,
      totalCents: 336000,
      plancherApplique: true,
    });
    expect(prixSelonGrille(GRILLE_PAR_DEFAUT, { stagiaires: 8, heures: 7 }).plancherApplique).toBe(false);
  });
});

describe('lireGrille', () => {
  it('retombe sur la grille par défaut sans réglage', () => {
    expect(lireGrille(null)).toEqual(GRILLE_PAR_DEFAUT);
  });
  it('écarte un palier mal formé, garde les valeurs saisies', () => {
    expect(
      lireGrille({ tarifStandardCents: 3000, plancherHoraireCents: 18000, paliers: [{ aPartirDe: 0, tarifHoraireCents: 1 }, { aPartirDe: 12, tarifHoraireCents: 2500 }], coutFormateurHoraireCents: 4500 }),
    ).toEqual({ tarifStandardCents: 3000, plancherHoraireCents: 18000, paliers: [{ aPartirDe: 12, tarifHoraireCents: 2500 }], coutFormateurHoraireCents: 4500 });
  });
});

describe('prixParDefaut — un prix saisi l’emporte sur la grille', () => {
  const base = { grille: GRILLE_PAR_DEFAUT, stagiaires: 4, heures: 14 };

  it('sans aucun prix : la grille (4 stagiaires × 14 h × 60 €)', () => {
    expect(prixParDefaut(base)).toMatchObject({ source: 'grille', quantite: 4, unitaireCents: 84000, totalCents: 336000 });
  });
  it('le montant du dossier saisi passe avant la grille', () => {
    expect(prixParDefaut({ ...base, dossierTotalCents: 250000 })).toMatchObject({ source: 'dossier', quantite: 1, totalCents: 250000 });
  });
  it('le prix de la formation passe avant le dossier, par stagiaire ou global', () => {
    expect(prixParDefaut({ ...base, dossierTotalCents: 250000, formationCents: 90000 })).toMatchObject({ source: 'formation', quantite: 4, totalCents: 360000 });
    expect(prixParDefaut({ ...base, formationCents: 300000, formationMode: 'forfait' })).toMatchObject({ quantite: 1, totalCents: 300000 });
  });
  it('le prix de la séance passe avant tout, et 0 vaut « pas de prix »', () => {
    expect(prixParDefaut({ ...base, seanceCents: 70000, formationCents: 90000 })).toMatchObject({ source: 'seance', totalCents: 280000 });
    expect(prixParDefaut({ ...base, seanceCents: 0, formationCents: 0, dossierTotalCents: 0 }).source).toBe('grille');
  });
});
