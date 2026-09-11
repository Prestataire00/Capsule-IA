// Fiche formation : l'encadré pédagogique restitue toute la fiche d'identité
// (colonnes + metadata.catalog), pas seulement objectifs et public visé.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(path.resolve(__dirname, '../app/(dashboard)/formations/[id]/page.tsx'), 'utf-8');

describe('encadré d’information de la formation', () => {
  it('affiche la fiche d’identité complète', () => {
    for (const l of [
      'Information générale',
      'Catégorie',
      'Modalité',
      'Durée',
      'Effectif',
      'Tarif de base',
      'Lieu par défaut',
      'Certification',
      'Recyclage',
      'Éligible CPF',
      'Créée le',
      'Financements',
    ]) {
      expect(page, l).toContain(l);
    }
  });

  it('affiche le contenu pédagogique et les modalités saisies au catalogue', () => {
    for (const l of [
      'Contenu pédagogique',
      'Objectifs pédagogiques',
      'Public visé & prérequis',
      'Programme détaillé',
      'Méthodes pédagogiques',
      'Modalités d’évaluation',
      'Indicateurs de résultats',
      'Accessibilité (handicap)',
      'Délais et modalités d’accès',
    ]) {
      expect(page, l).toContain(l);
    }
  });

  it('lit les tarifs, financements et recyclage depuis metadata.catalog', () => {
    expect(page).toContain('f.metadata?.catalog');
    expect(page).toContain('priceEntrepriseCents');
    expect(page).toContain('fundingTypes');
    expect(page).toContain('recyclingEnabled');
    expect(page).toContain("created_at");
  });

  it('n’injecte pas le HTML des champs riches dans la page', () => {
    expect(page).not.toContain('dangerouslySetInnerHTML');
    expect(page).toContain('function texte(');
    expect(page).toContain("replace(/<[^>]+>/g, '')");
  });
});
