import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { chargerEspaceComplet } from './espace-complet';
import { lienOuverture } from './questionnaires-entreprise';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

/**
 * Le référent ouvre un questionnaire prévu dont le jour est venu : son
 * assignation est créée (ou reprise) à son nom. Seul ce que son espace
 * annonce comme disponible s'ouvre — ni un autre dossier, ni avant la date.
 */
export async function ouvrirQuestionnairePrevu(input: {
  contactId: string;
  organizationId: string;
  token: string;
  dossierId: string;
  templateId: string;
}): Promise<string | null> {
  const espace = await chargerEspaceComplet(input.contactId, input.organizationId, input.token);
  const attendu = lienOuverture(input.token, input.dossierId, input.templateId);
  const prevu = espace?.questionnaires.find((q) => q.statut === 'disponible' && q.lien === attendu);
  if (!prevu) return null;

  const sb = admin();
  const { data: existante } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', input.templateId)
    .eq('dossier_id', input.dossierId)
    .eq('recipient_kind', 'company_rep')
    .eq('recipient_contact_id', input.contactId)
    .neq('status', 'expired')
    .limit(1)
    .maybeSingle();
  if (existante) return (existante as { id: string }).id;

  const { data: c } = await sb.schema('app').from('contacts').select('first_name, last_name, email').eq('id', input.contactId).maybeSingle();
  const contact = c as { first_name: string | null; last_name: string | null; email: string | null } | null;
  const { data: creee, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: input.organizationId,
      template_id: input.templateId,
      dossier_id: input.dossierId,
      recipient_kind: 'company_rep',
      recipient_contact_id: input.contactId,
      recipient_email: contact?.email ?? null,
      recipient_name: `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || null,
      token_hash: `pending-${randomUUID()}`,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !creee) {
    console.error('[espace entreprise] questionnaire non ouvert', error?.message);
    return null;
  }
  return (creee as { id: string }).id;
}
