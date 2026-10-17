import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

const valide = (e: string | null | undefined): string | null => {
  const t = e?.trim();
  return t && !t.toLowerCase().endsWith('.invalid') ? t : null;
};

/**
 * L'adresse d'un destinataire de questionnaire, lue AUJOURD'HUI sur sa fiche.
 *
 * L'assignation gardait l'adresse du jour de sa création : un interlocuteur
 * créé sans e-mail, puis complété (Nathanaël, France Métier, 16/10/2026),
 * restait « sans adresse » pour toujours. L'adresse figée ne sert plus qu'en
 * dernier recours. Pour l'entreprise, l'e-mail de la société prend le relais
 * de l'interlocuteur qui n'en a pas.
 */
export async function adresseDuDestinataire(
  sb: Client,
  a: {
    recipient_kind: string;
    recipient_email: string | null;
    recipient_learner_id?: string | null;
    recipient_trainer_id?: string | null;
    recipient_contact_id?: string | null;
    dossier_id?: string | null;
  },
): Promise<string | null> {
  if (a.recipient_kind === 'learner' && a.recipient_learner_id) {
    const { data } = await sb.schema('app').from('learners').select('email').eq('id', a.recipient_learner_id).maybeSingle();
    return valide((data as { email: string | null } | null)?.email) ?? valide(a.recipient_email);
  }
  if (a.recipient_kind === 'trainer' && a.recipient_trainer_id) {
    const { data } = await sb.schema('app').from('trainers').select('email').eq('id', a.recipient_trainer_id).maybeSingle();
    return valide((data as { email: string | null } | null)?.email) ?? valide(a.recipient_email);
  }
  if (a.recipient_kind === 'company_rep') {
    if (a.recipient_contact_id) {
      const { data } = await sb
        .schema('app')
        .from('contacts')
        .select('email, company:companies(contact_email)')
        .eq('id', a.recipient_contact_id)
        .maybeSingle();
      const c = data as { email: string | null; company: { contact_email: string | null } | Array<{ contact_email: string | null }> | null } | null;
      const societe = Array.isArray(c?.company) ? c?.company[0] : c?.company;
      const trouvee = valide(c?.email) ?? valide(societe?.contact_email);
      if (trouvee) return trouvee;
    }
    return valide(a.recipient_email);
  }
  return valide(a.recipient_email);
}
