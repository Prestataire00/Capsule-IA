// « Comment on règle les automatisations ? Quand je clique sur Régler, il ne se
// passe rien. » — Ismael, 24/09/2026.
//
// Ce n'était pas une panne : il n'y avait rien à montrer. Cinq envois sur
// quatorze ne se règlent pas — ni coupure, ni délai — et le bouton leur était
// proposé quand même. Il ouvrait une boîte sans un seul champ : deux boutons,
// et rien entre eux.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REGLABLES } from '../features/emails/programmation-envois';
import { ENVOIS_AUTOMATIQUES } from '../features/emails/envois-automatiques';

const COMPOSANT = fs.readFileSync(
  path.resolve(__dirname, '../app/(dashboard)/emails/automatiques/reglage.client.tsx'),
  'utf-8',
);

const sansReglage = Object.entries(REGLABLES)
  .filter(([, r]) => !r.coupable && !r.delai)
  .map(([kind]) => kind)
  .sort();

describe('les envois qui n’ont rien à régler', () => {
  it('sont bien ceux qu’on croit', () => {
    // Fiche besoin et alertes internes partent au déclenchement ; devis et
    // relance de facture suivent une décision, pas un calendrier.
    expect(sansReglage).toEqual([
      'fiche_besoin',
      'fiche_besoin_completee',
      'invoice_reminder_auto',
      'nouvelle_demande',
      'quote_sent',
    ]);
  });

  it('ne sont pas une poignée de cas isolés', () => {
    // Un tiers du catalogue : le défaut se rencontrait donc tout de suite.
    expect(sansReglage.length).toBeGreaterThanOrEqual(5);
    expect(ENVOIS_AUTOMATIQUES.length).toBeGreaterThan(sansReglage.length);
  });
});

describe('l’écran', () => {
  it('applique la même règle que les données', () => {
    expect(COMPOSANT).toContain('const rienARegler = !reglable.coupable && !reglable.delai;');
  });

  it('dit pourquoi, au lieu d’ouvrir une boîte vide', () => {
    expect(COMPOSANT).toContain('Aucun réglage : il part au moment de son déclencheur');
  });

  it('et tranche avant de proposer le bouton', () => {
    // Si la garde passait après, le bouton resterait affiché.
    //
    // On vise le bouton, pas le mot : la première version comparait à
    // `indexOf('Régler')`, qui tombait sur le commentaire d'en-tête — donc sur
    // un texte, pas sur du rendu.
    const bouton = COMPOSANT.indexOf('<Pencil className="w-3 h-3" /> Régler');
    expect(bouton, 'bouton « Régler » introuvable').toBeGreaterThan(-1);
    expect(COMPOSANT.indexOf('if (rienARegler)')).toBeLessThan(bouton);
  });
});

describe('les envois qui se règlent, eux, gardent leur formulaire', () => {
  it('une coupure, un délai, ou les deux', () => {
    const reglables = Object.entries(REGLABLES).filter(([, r]) => r.coupable || r.delai);
    expect(reglables.length).toBeGreaterThan(0);
    for (const [kind, r] of reglables) {
      expect(!r.coupable && !r.delai, kind).toBe(false);
    }
  });

  it('et l’écran affiche le champ correspondant', () => {
    expect(COMPOSANT).toContain('{reglable.coupable && (');
    expect(COMPOSANT).toContain('{reglable.delai && (');
  });
});
