'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { accessibleSession } from './access';
import { inscrireLeJourJ } from './inscrire-jour-j';
import { ajoutJourJSchema, type AjoutJourJ } from './ajout-jour-j.schema';
import { membresParRole } from '@/features/trainer-space/validation-recipients';

/**
 * Un stagiaire se présente le jour J sans être sur la liste : on l'ajoute
 * depuis l'émargement, et il signe tout de suite. La liste des signataires
 * attendus se recalcule à chaque lecture (`session_expected_signers`) : une
 * inscription manuelle à la séance suffit pour qu'il apparaisse sur toutes
 * les feuilles et sur le QR projeté. Équipe ou formateur de la séance.
 */
export async function ajouterStagiaireJourJ(input: AjoutJourJ): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const p = ajoutJourJSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const acces = await accessibleSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: 'Cette séance ne vous est pas accessible.' };
  const organizationId = acces.value.organization_id;
  const admin = supabaseAdmin();

  const inscrit = await inscrireLeJourJ(admin, {
    sessionId: p.data.sessionId,
    organizationId,
    prenom: p.data.prenom,
    nom: p.data.nom,
    email: p.data.email ?? null,
  });
  if (!inscrit.ok) return inscrit;
  const { learnerId, dossierId } = inscrit;

  const nom = `${p.data.prenom} ${p.data.nom}`;
  // Ajouté par le formateur : l'équipe régularise (dossier, convention, facture).
  if (acces.value.formateur) {
    const equipe = await membresParRole(admin, organizationId, ['owner', 'admin', 'gestionnaire']);
    if (equipe.length > 0) {
      const { error } = await admin
        .schema('app')
        .from('notifications')
        .insert(
          equipe.map((m) => ({
            organization_id: organizationId,
            channel: 'in_app',
            template_code: 'emargement.ajout_jour_j',
            recipient_user_id: m.userId,
            subject: `${nom} ajouté le jour J par le formateur — à régulariser`,
            payload: { session_id: p.data.sessionId, learner_id: learnerId, dossier_id: dossierId },
            status: 'sent',
            sent_at: new Date().toISOString(),
            related_aggregate_type: 'session',
            related_aggregate_id: p.data.sessionId,
          })) as never,
        );
      if (error) console.error('[émargement] équipe non prévenue', error.message);
    }
  }

  revalidatePath(`/sessions/${p.data.sessionId}/emargements`);
  revalidatePath(`/emarger/${p.data.sessionId}`);
  revalidatePath(`/seance/${p.data.sessionId}`);
  return {
    ok: true,
    message: dossierId
      ? `${nom} est sur la feuille : il peut signer.`
      : `${nom} est sur la feuille : il peut signer. Rattachez-le à son dossier pour la convention et la facture.`,
  };
}
