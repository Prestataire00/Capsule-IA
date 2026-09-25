import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Le modèle « Satisfaction formateur », commun au cron et à l'envoi manuel.
 *
 * Il vivait dans la route du cron, seule à s'en servir : la fin d'un dossier
 * déclenchait l'envoi, et c'était le seul moment possible. Or on veut parfois
 * le demander avant — une session s'est mal passée, un client s'interroge — ou
 * après coup, quand le dossier s'est terminé sans que l'automatisation parte.
 *
 * Le sortir de là évite la seule chose qui compte ici : deux modèles portant le
 * même nom, avec des questions différentes, dont les réponses ne se compareraient
 * plus d'une formation à l'autre.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export const TRAINER_SAT_TEMPLATE_CODE = 'satisfaction_formateur_default';

export async function ensureTrainerSatisfactionTemplate(sb: Client): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', TRAINER_SAT_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_formateur',
      code: TRAINER_SAT_TEMPLATE_CODE,
      title: 'Satisfaction formateur — fin de formation',
      schema: {
        version: 1,
        fields: [
          { key: 'nps', kind: 'nps' },
          { key: 'overallRating', kind: 'rating_5' },
          { key: 'organizationRating', kind: 'rating_5' },
          { key: 'groupRating', kind: 'rating_5' },
          { key: 'whatWorked', kind: 'long_text' },
          { key: 'whatToImprove', kind: 'long_text' },
        ],
      },
      is_active: true,
    } as never)
    .select('id')
    .single();
  return (created as { id: string }).id;
}
