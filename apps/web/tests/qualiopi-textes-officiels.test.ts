// La page qualité affichait un emplacement vide à la place de l'exigence de
// chaque indicateur. 0141 renseigne le texte officiel (décret n° 2019-565) et
// l'applicabilité par catégorie d'action ; ces tests la verrouillent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/0141_qualiopi_textes_officiels.sql'),
  'utf-8',
);

/** Ligne VALUES d'un indicateur : (n, 'exigence', ARRAY[preuves], applies_to, …). */
function ligne(numero: number): string {
  const re = new RegExp(`^  \\(${numero}, '[\\s\\S]*?\\)(?=,\\n  \\(|\\n\\) AS v)`, 'm');
  const m = MIGRATION.match(re);
  if (!m) throw new Error(`indicateur ${numero} absent`);
  return m[0];
}

describe('textes officiels du RNQ (0141)', () => {
  it('renseigne les 32 indicateurs', () => {
    for (let n = 1; n <= 32; n++) expect(ligne(n)).toMatch(/'Le prestataire|'Lorsque|'Pour les formations/);
  });

  it('reprend le texte officiel de la veille légale (23)', () => {
    expect(ligne(23)).toContain('réalise une veille légale et réglementaire sur le champ de la formation professionnelle');
  });

  it.each([
    [8, ['action_formation', 'apprentissage'], ['bilan_competences', 'vae']],
    [7, ['action_formation', 'apprentissage'], ['bilan_competences', 'vae']],
    [16, ['action_formation', 'vae', 'apprentissage'], ['bilan_competences']],
    [14, ['apprentissage'], ['action_formation']],
  ])('l’indicateur %i vise les bonnes catégories', (numero, visees, exclues) => {
    const l = ligne(numero);
    for (const c of visees) expect(l).toContain(`'${c}'`);
    for (const c of exclues) expect(l).not.toContain(`'${c}'`);
  });

  it('traite un dossier sans catégorie comme une action de formation', () => {
    expect(MIGRATION).toContain("v_action := COALESCE(v_action, 'action_formation');");
  });
});
