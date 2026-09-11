// Une formation n'a plus qu'une source d'indicateurs de résultats : la page
// « Indicateurs de résultats ». Le formulaire portait un champ libre, repris
// par le programme imprimé — un second jeu de chiffres qui pouvait contredire
// le calcul réel (audit CAP-33).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { indicatorsPlainText } from '@/features/indicateurs/formation-indicators-view';

describe('indicateurs de résultats d’une formation', () => {
  it('le formulaire ne propose plus de saisie libre des indicateurs', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../features/formations/ui/formation-form.tsx'),
      'utf-8',
    );
    expect(src).not.toMatch(/name="resultIndicators"/);
    expect(src).toContain('/indicateurs');
  });

  it('formule les résultats pour le programme imprimé', () => {
    expect(
      indicatorsPlainText({ learners: 12, satisfactionRate: 92, satisfactionResponses: 30, declaredSources: [] }),
    ).toBe('12 apprenants formés · satisfaction 92 % (30 réponses)');
  });

  it('accorde au singulier', () => {
    expect(
      indicatorsPlainText({ learners: 1, satisfactionRate: 100, satisfactionResponses: 1, declaredSources: [] }),
    ).toBe('1 apprenant formé · satisfaction 100 % (1 réponse)');
  });

  it('ne produit rien sans résultat, pour que la ligne disparaisse du programme', () => {
    expect(
      indicatorsPlainText({ learners: 0, satisfactionRate: null, satisfactionResponses: 0, declaredSources: [] }),
    ).toBe('');
    expect(indicatorsPlainText(null)).toBe('');
  });

  it('n’affiche pas un taux de satisfaction sans réponse', () => {
    expect(
      indicatorsPlainText({ learners: 4, satisfactionRate: 80, satisfactionResponses: 0, declaredSources: [] }),
    ).toBe('4 apprenants formés');
  });
});
