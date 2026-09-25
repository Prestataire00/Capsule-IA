import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { questionsDuSchema, CHAMPS_FICHE_BESOIN } from './fiche-besoin';
import type { Question } from './schema';

/**
 * Les questions de la fiche besoin telles que cet organisme les pose.
 *
 * Celles de son modèle quand il en a paramétré un, celles du modèle intégré
 * sinon. Un seul endroit pour cette règle : le formulaire, le nettoyage des
 * réponses et l'affichage doivent poser, accepter et montrer exactement les
 * mêmes questions — trois lectures séparées finiraient par diverger, et une
 * réponse tomberait entre les deux.
 *
 * Lecture tolérante : si le modèle est illisible, on rend celui d'origine
 * plutôt que rien. Une fiche besoin avec les questions d'origine vaut mieux
 * qu'un formulaire vide.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

const QUESTIONS_INTEGREES: Question[] = CHAMPS_FICHE_BESOIN.map((c) => ({
  id: c.cle,
  label: c.label,
  type: c.type === 'rating' ? 'rating' : 'text',
  required: c.requis,
  ...(c.type === 'rating' ? { max: 5 } : {}),
})) as Question[];

export async function questionsFicheBesoin(
  sb: Client,
  organizationId: string | null | undefined,
): Promise<Question[]> {
  if (!organizationId) return QUESTIONS_INTEGREES;

  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('schema')
    .eq('organization_id', organizationId)
    .eq('kind', 'positionnement')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[fiche besoin] modèle de l’organisme illisible', error.message);
    return QUESTIONS_INTEGREES;
  }
  if (!data) return QUESTIONS_INTEGREES;

  const questions = questionsDuSchema((data as { schema?: unknown }).schema);
  return questions.length > 0 ? questions : QUESTIONS_INTEGREES;
}

/** Les clés que le nettoyage doit accepter, pour ce modèle. */
export const clesDeQuestions = (questions: readonly Question[]): string[] => questions.map((q) => q.id);
