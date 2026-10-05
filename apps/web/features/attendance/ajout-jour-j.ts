'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { accessibleSession } from './access';
import { memeIdentite } from './room-code';
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

  // Le dossier qu'il rejoint : celui de la séance, s'il n'y en a qu'un.
  const [{ data: s }, { data: sd }] = await Promise.all([
    admin.schema('app').from('sessions').select('dossier_id, company_id').eq('id', p.data.sessionId).maybeSingle(),
    admin.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', p.data.sessionId),
  ]);
  const seance = s as { dossier_id: string | null; company_id: string | null } | null;
  const dossierIds = [
    ...new Set([seance?.dossier_id, ...((sd ?? []) as Array<{ dossier_id: string }>).map((x) => x.dossier_id)]),
  ].filter((id): id is string => Boolean(id));
  const dossierId = dossierIds.length === 1 ? dossierIds[0]! : null;
  const { data: d } = dossierId
    ? await admin.schema('app').from('dossiers').select('company_id').eq('id', dossierId).maybeSingle()
    : { data: null };
  const companyId = (d as { company_id: string | null } | null)?.company_id ?? seance?.company_id ?? null;

  // Fiche existante : même adresse et même personne ; sinon on la crée.
  const email = p.data.email?.trim().toLowerCase() || null;
  let learnerId: string | null = null;
  if (email) {
    const { data: connus } = await admin
      .schema('app')
      .from('learners')
      .select('id, first_name, last_name')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .is('deleted_at', null);
    learnerId =
      ((connus ?? []) as Array<{ id: string; first_name: string; last_name: string }>).find((l) =>
        memeIdentite({ prenom: l.first_name, nom: l.last_name }, { prenom: p.data.prenom, nom: p.data.nom }),
      )?.id ?? null;
  }
  if (!learnerId) {
    const { data: cree, error } = await admin
      .schema('app')
      .from('learners')
      .insert({
        organization_id: organizationId,
        first_name: p.data.prenom,
        last_name: p.data.nom,
        email,
        company_id: companyId,
      } as never)
      .select('id')
      .single();
    if (error || !cree) return { ok: false, error: 'Le stagiaire n’a pas pu être créé.' };
    learnerId = (cree as { id: string }).id;
  }

  if (dossierId) {
    const { error } = await admin
      .schema('app')
      .from('dossier_learners' as never)
      .upsert({ dossier_id: dossierId, learner_id: learnerId, organization_id: organizationId } as never, {
        onConflict: 'dossier_id,learner_id',
      });
    if (error) console.error('[émargement] rattachement au dossier impossible', dossierId, error.message);
  }

  const { error: erreurInscription } = await admin
    .schema('app')
    .from('session_participants')
    .upsert(
      {
        session_id: p.data.sessionId,
        organization_id: organizationId,
        participant_kind: 'learner',
        learner_id: learnerId,
        source: 'manual_add',
      } as never,
      { onConflict: 'session_id,participant_kind,participant_id' },
    );
  if (erreurInscription) return { ok: false, error: 'Le stagiaire n’a pas pu être inscrit à la séance.' };

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
