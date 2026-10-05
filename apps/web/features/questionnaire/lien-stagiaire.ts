import 'server-only';
import { generateApprenantToken } from '@/shared/lib/apprenant-token';

/**
 * Lien personnel d'un stagiaire vers une page seule (questionnaire, quiz),
 * transmis par son entreprise : plus d'espace apprenant à parcourir.
 */
export async function lienStagiaire(
  base: string,
  chemin: 'questionnaire' | 'quiz',
  args: { learnerId: string; organizationId: string; dossierId: string; cibleId: string },
): Promise<string> {
  const { token } = await generateApprenantToken({
    learnerId: args.learnerId,
    organizationId: args.organizationId,
    dossierId: args.dossierId,
  });
  const racine = base.replace(/\/$/, '');
  return chemin === 'questionnaire'
    ? `${racine}/questionnaire/stagiaire/${token}/${args.cibleId}`
    : `${racine}/questionnaire/quiz/${token}/${args.cibleId}`;
}
