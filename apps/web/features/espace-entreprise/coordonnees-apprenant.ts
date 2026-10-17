import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { chargerEspaceComplet } from './espace-complet';
import { coordonneesApprenantSchema, type CoordonneesApprenant } from './coordonnees.schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/**
 * Le référent corrige l'e-mail et le téléphone d'un de SES salariés : celui-ci
 * doit figurer parmi les apprenants de son espace, sinon rien ne s'écrit.
 * L'équipe est prévenue de ce qui a changé.
 */
export async function mettreAJourCoordonnees(
  acces: { contactId: string; organizationId: string; token: string },
  brut: CoordonneesApprenant,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = coordonneesApprenantSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const espace = await chargerEspaceComplet(acces.contactId, acces.organizationId, acces.token);
  const apprenant = espace?.apprenants.find((a) => a.id === p.data.learnerId);
  if (!espace || !apprenant) return { ok: false, error: 'Ce salarié ne fait pas partie de vos inscrits.' };

  const email = p.data.email.toLowerCase() || null;
  const telephone = p.data.telephone || null;
  const admin = supabaseAdmin() as unknown as Admin;
  const { error } = await admin
    .schema('app')
    .from('learners')
    .update({ email, phone: telephone, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.learnerId)
    .eq('organization_id', acces.organizationId);
  if (error) {
    console.error('[espace entreprise] coordonnées non enregistrées', p.data.learnerId, error.message);
    return {
      ok: false,
      error: error.code === '23505' ? 'Cette adresse e-mail est déjà celle d’un autre apprenant.' : 'Les coordonnées n’ont pas pu être enregistrées.',
    };
  }

  const changements = [
    (apprenant.email ?? '') !== (email ?? '') ? `e-mail : ${email ?? 'retiré'}` : null,
    (apprenant.telephone ?? '') !== (telephone ?? '') ? `téléphone : ${telephone ?? 'retiré'}` : null,
  ].filter(Boolean);
  if (changements.length) {
    const { error: nErr } = await admin
      .schema('app')
      .from('notifications')
      .insert({
        organization_id: acces.organizationId,
        channel: 'in_app',
        template_code: 'coordonnees_apprenant_entreprise',
        subject: `${espace.entreprise ?? 'L’entreprise'} a mis à jour les coordonnées de ${apprenant.nom}`,
        payload: { learner_id: p.data.learnerId, dossier_id: apprenant.dossierId, changements },
        status: 'sent',
        sent_at: new Date().toISOString(),
        related_aggregate_type: 'dossier',
        related_aggregate_id: apprenant.dossierId,
      } as never);
    if (nErr) console.error('[espace entreprise] notification non enregistrée', nErr.message);
  }
  return { ok: true };
}
