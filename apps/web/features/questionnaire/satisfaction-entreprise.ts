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
      schema: {
        version: 1,
        questions: [
          { key: 'nps', label: 'Recommanderiez-vous cet organisme ?', kind: 'nps' },
          {
            key: 'objectifsAtteints',
            label: 'Les objectifs annoncés ont-ils été atteints ?',
            kind: 'rating_5',
          },
          {
            key: 'organisation',
            label: 'Organisation avant et pendant la formation (planning, documents, interlocuteur)',
            kind: 'rating_5',
          },
          {
            key: 'effetTerrain',
            label: 'Effet constaté sur le travail de vos équipes',
            kind: 'rating_5',
          },
          { key: 'pointsForts', label: 'Ce qui vous a satisfait', kind: 'long_text' },
          { key: 'pointsAmeliorer', label: 'Ce que nous devrions améliorer', kind: 'long_text' },
          {
            key: 'besoinsSuite',
            label: 'Besoins de formation à venir dans votre entreprise',
            kind: 'long_text',
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
