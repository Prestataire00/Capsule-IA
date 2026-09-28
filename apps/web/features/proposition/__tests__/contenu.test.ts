import { describe, it, expect } from 'vitest';
import { controlerCadre, formuleTarif, lignesDevis, normaliser, scenarios, totalHtCents } from '../contenu';
import { propositionSolutionsTerrain } from './fixture';

describe('le prix de la proposition se calcule, il ne se devine pas', () => {
  it('reproduit le tarif de la proposition de Laurie', () => {
    const c = propositionSolutionsTerrain();
    expect(totalHtCents(c.tarif)).toBe(252_000);
    expect(formuleTarif(c.tarif)).toMatch(/^12 participants × 6 h × 35 € = 2\s520 € HT$/);
    expect(scenarios(c.tarif)).toEqual([
      { participants: 10, totalCents: 210_000, retenu: false },
      { participants: 12, totalCents: 252_000, retenu: true },
      { participants: 15, totalCents: 315_000, retenu: false },
    ]);
  });

  it('le devis retombe exactement sur le total annoncé', () => {
    const [l] = lignesDevis(propositionSolutionsTerrain());
    expect(l).toBeDefined();
    expect(Math.round(l!.quantite * l!.prixUnitaireCents)).toBe(252_000);
  });

  it('au forfait ou par apprenant aussi', () => {
    const c = propositionSolutionsTerrain();
    expect(totalHtCents({ ...c.tarif, mode: 'forfait', prix_unitaire_cents: 300_000 })).toBe(300_000);
    expect(totalHtCents({ ...c.tarif, mode: 'par_apprenant', prix_unitaire_cents: 20_000 })).toBe(240_000);
  });

  it('borne ce que l’IA rend', () => {
    const c = propositionSolutionsTerrain();
    const n = normaliser({ ...c, tarif: { ...c.tarif, prix_unitaire_cents: -5, participants: 9999 } });
    expect(n.tarif.prix_unitaire_cents).toBe(0);
    expect(n.tarif.participants).toBe(500);
  });
});

describe('une action de formation, pas du coaching', () => {
  it('la proposition de référence passe', () => {
    expect(controlerCadre(propositionSolutionsTerrain())).toEqual([]);
  });

  it.each([
    ['Séances de coaching pour les managers', /coaching/],
    ['Un accompagnement individuel de chaque salarié', /accompagnement individuel/],
    ['Un programme personnalisé pour chacun', /programme personnalis/],
    ['Une mission de conseil en fin de parcours', /mission de conseil/],
    ['Des séances individuelles de 1 h', /séances individuelles/],
  ])('relève « %s »', (phrase, motif) => {
    const c = propositionSolutionsTerrain();
    const alertes = controlerCadre({ ...c, presentation: [phrase] });
    expect(alertes.join(' ')).toMatch(motif);
  });

  it('contextualiser les cas pratiques au métier du client reste permis', () => {
    const c = propositionSolutionsTerrain();
    expect(controlerCadre({ ...c, adaptation: ['Chaque groupe applique l’atelier à ses propres cas, adaptés au métier.'] })).toEqual([]);
  });

  it('sans objectifs, sans modules ou sans évaluation, ce n’est pas une formation', () => {
    const c = propositionSolutionsTerrain();
    expect(controlerCadre({ ...c, objectifs: [], sessions: [], evaluation: [] })).toHaveLength(3);
  });
});

describe('la sortie aplatie de l’IA redevient une proposition', () => {
  it('libellés, objectifs et numérotation des modules', async () => {
    const { depuisSortie, versSortie, enLibelle, enObjectif } = await import('../contenu');
    expect(enLibelle('Public cible : Encadrement de Solutions Terrain')).toEqual({ libelle: 'Public cible', valeur: 'Encadrement de Solutions Terrain' });
    expect(enLibelle('Formation accessible')).toEqual({ libelle: '', valeur: 'Formation accessible' });
    expect(enObjectif("✓ Expliquer ce qu'est un écosystème IA")).toEqual({ verbe: 'Expliquer', texte: "ce qu'est un écosystème IA" });
    const c = propositionSolutionsTerrain();
    const allerRetour = depuisSortie(versSortie(c));
    expect(allerRetour).toEqual(c);
  });

  it('les modules sont numérotés en continu d’une session à l’autre', async () => {
    const { depuisSortie, versSortie } = await import('../contenu');
    const c = propositionSolutionsTerrain();
    const deux = { ...c, sessions: [c.sessions[0]!, { ...c.sessions[0]!, titre: 'Session 2' }] };
    const r = depuisSortie(versSortie(deux));
    expect(r.sessions.flatMap((s) => s.modules.map((m) => m.numero))).toEqual([1, 2]);
  });
});
