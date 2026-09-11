import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadIndicateurs } from './load-indicateurs';
import { loadDeclared, fusionner } from './declared';
import type { FormationIndicatorsView } from './formation-indicators-view';

/**
 * Indicateurs d'UNE formation, lus à la même source que la page « Indicateurs
 * de résultats » : dossiers terminés et questionnaires de satisfaction, plus
 * les chiffres déclarés à la main pour cette formation.
 *
 * La formation portait jusqu'ici son propre champ texte, saisi à la main dans
 * le formulaire et repris tel quel par le programme imprimé — donc un second
 * jeu de chiffres, sans lien avec le premier, et qui pouvait le contredire
 * (audit CAP-33). Il n'y a plus qu'une source.
 *
 * Toutes périodes confondues : c'est ce que publie la fiche publique.
 */
export async function loadFormationIndicators(
  organizationId: string,
  formationId: string,
): Promise<FormationIndicatorsView> {
  const [calcul, declarations] = await Promise.all([
    loadIndicateurs(supabaseServer() as never, null),
    loadDeclared(organizationId, null),
  ]);

  const ligne = fusionner(calcul, declarations).byFormation.find((f) => f.formationId === formationId);

  return {
    learners: ligne?.learners ?? 0,
    satisfactionRate: ligne?.satisfactionRate ?? null,
    satisfactionResponses: ligne?.satisfactionResponses ?? 0,
    declaredSources: [
      ...new Set(declarations.filter((d) => d.formationId === formationId).map((d) => d.source)),
    ],
  };
}
