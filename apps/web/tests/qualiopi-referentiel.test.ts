// Le référentiel Qualiopi semé à l'origine ne suivait pas la numérotation
// officielle du RNQ : « Indicateur 23 » y désignait l'évaluation des acquis,
// alors qu'il s'agit de la veille légale et réglementaire (audit CAP-35).
// Ces tests verrouillent la correspondance officielle, côté base comme côté
// guidage, pour qu'un ancien numéro ne puisse pas revenir.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { guidanceFor } from '@/features/dossier/qualiopi-guidance';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/0139_qualiopi_referentiel_officiel.sql'),
  'utf-8',
);

/** Extrait (numéro → titre, critère) des lignes V9 semées par la migration. */
function ligneV9(numero: number): { criterion: number; title: string } | null {
  const re = new RegExp(`\\('V9-I${numero}',\\s*${numero},\\s*'\\w+',\\s*(\\d),\\s*'[^']*(?:''[^']*)*',\\s*'((?:[^']|'')*)'`);
  const m = MIGRATION.match(re);
  return m ? { criterion: Number(m[1]), title: m[2]!.replace(/''/g, "'") } : null;
}

describe('référentiel Qualiopi officiel (RNQ, guide V9)', () => {
  it('sème exactement 32 indicateurs V9', () => {
    expect(MIGRATION.match(/\('V9-I\d+',/g)?.length).toBe(32);
  });

  it.each([
    [4, 2, /Analyse du besoin/],
    [8, 2, /Positionnement/],
    [11, 3, /Évaluation de l'atteinte des objectifs/],
    [12, 3, /Engagement des bénéficiaires/],
    [21, 5, /Compétences des intervenants/],
    [23, 6, /Veille légale et réglementaire/],
    [30, 7, /Recueil des appréciations/],
    [31, 7, /réclamations/],
  ])('l’indicateur %i relève du critère %i et porte le bon intitulé', (numero, critere, titre) => {
    const l = ligneV9(numero);
    expect(l).not.toBeNull();
    expect(l!.criterion).toBe(critere);
    expect(l!.title).toMatch(titre);
  });

  it('le guidage suit les numéros officiels', () => {
    expect(guidanceFor(11, 'proof').todo).toMatch(/évaluation des acquis/);
    expect(guidanceFor(11, 'proof').tab).toBe('questionnaires');
    expect(guidanceFor(12, 'proof').tab).toBe('emargements');
    expect(guidanceFor(5, 'proof', { formationId: 'f1' }).href).toBe('/formations/f1/edit');
    expect(guidanceFor(21, 'proof', { dossierId: 'd1' }).href).toContain('affecter-formateur');
  });

  it('l’onglet Qualiopi du dossier écarte l’ancien jeu et n’utilise plus ses codes', () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, '../app/(dashboard)/dossiers/[id]/qualiopi/page.tsx'),
      'utf-8',
    );
    expect(page).toContain("'legacy'");
    expect(page).not.toMatch(/\bI(10|15|22|23|26|27):/);
  });
});
