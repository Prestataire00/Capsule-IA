import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Le modèle « Satisfaction entreprise », pour le client qui commande.
 *
 * L'organisme interrogeait le stagiaire, le financeur et le formateur — jamais
 * celui qui paie et qui décide de recommencer. Qualiopi attend pourtant le
 * retour des « parties prenantes » (indicateurs 30 et 31), et l'entreprise en
 * est une : ce qu'elle pense de l'organisation, de l'atteinte des objectifs et
 * de l'effet sur ses équipes ne se lit dans aucun des trois autres.
 *
 * Les questions ne sont pas celles du stagiaire. Un salarié dit s'il a appris ;
 * son employeur dit si ça a servi — et c'est cette réponse-là qu'on ne pouvait
 * pas recueillir.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export const COMPANY_SAT_TEMPLATE_CODE = 'satisfaction_entreprise_default';

export async function ensureCompanySatisfactionTemplate(sb: Client): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', COMPANY_SAT_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_chaud',
      code: COMPANY_SAT_TEMPLATE_CODE,
      title: 'Satisfaction entreprise — commanditaire de la formation',
      description:
        'Retour de l’entreprise cliente sur la formation qu’elle a commandée (Qualiopi, parties prenantes).',
      // Forme `{ id, type, label, required }` — celle que lisent
      // `QuestionRenderer` et `validateAnswers`. La forme `{ key, kind }` du
      // modèle formateur ne se transpose PAS ici : sa page de réponse est
      // écrite en dur, tandis que celle-ci rend le schéma. Avec `key`/`kind`,
      // le formulaire se serait affiché vide — sept questions en base, aucune
      // à l'écran, et personne pour s'en apercevoir avant le premier client.
      schema: {
        questions: [
          { id: 'nps', type: 'nps', label: 'Recommanderiez-vous cet organisme ?', required: true },
          {
            id: 'objectifsAtteints',
            type: 'rating',
            max: 5,
            label: 'Les objectifs annoncés ont-ils été atteints ?',
            required: true,
          },
          {
            id: 'organisation',
            type: 'rating',
            max: 5,
            label: 'Organisation avant et pendant la formation (planning, documents, interlocuteur)',
            required: false,
          },
          {
            id: 'effetTerrain',
            type: 'rating',
            max: 5,
            label: 'Effet constaté sur le travail de vos équipes',
            required: false,
          },
          { id: 'pointsForts', type: 'text', label: 'Ce qui vous a satisfait', required: false },
          {
            id: 'pointsAmeliorer',
            type: 'text',
            label: 'Ce que nous devrions améliorer',
            required: false,
          },
          {
            id: 'besoinsSuite',
            type: 'text',
            label: 'Besoins de formation à venir dans votre entreprise',
            required: false,
          },
        ],
      },
      thank_you_message:
        'Merci — votre retour nourrit notre démarche qualité et prépare vos prochaines formations.',
      is_active: true,
    } as never)
    .select('id')
    .single();
  return (created as { id: string }).id;
}
