import 'server-only';
import type { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { memeIdentite } from './room-code';

/**
 * Inscrire à une séance un stagiaire qui n'était pas sur la liste : retrouver
 * sa fiche (même adresse, même personne) ou la créer, le rattacher au dossier
 * de la séance s'il n'y en a qu'un, l'inscrire à la séance. Sert à l'ajout du
 * jour J par l'équipe ou le formateur, et au stagiaire qui s'ajoute en
 * scannant le QR de la salle. L'appelant a vérifié son droit avant.
 */
export async function inscrireLeJourJ(
  admin: ReturnType<typeof supabaseAdmin>,
  args: { sessionId: string; organizationId: string; prenom: string; nom: string; email: string | null },
): Promise<{ ok: true; learnerId: string; dossierId: string | null } | { ok: false; error: string }> {
  const organizationId = args.organizationId;
  // Le dossier qu'il rejoint : celui de la séance, s'il n'y en a qu'un.
  const [{ data: s }, { data: sd }] = await Promise.all([
    admin.schema('app').from('sessions').select('dossier_id, company_id').eq('id', args.sessionId).maybeSingle(),
    admin.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', args.sessionId),
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
  const email = args.email?.trim().toLowerCase() || null;
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
        memeIdentite({ prenom: l.first_name, nom: l.last_name }, { prenom: args.prenom, nom: args.nom }),
      )?.id ?? null;
  }
  if (!learnerId) {
    const { data: cree, error } = await admin
      .schema('app')
      .from('learners')
      .insert({
        organization_id: organizationId,
        first_name: args.prenom,
        last_name: args.nom,
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
        session_id: args.sessionId,
        organization_id: organizationId,
        participant_kind: 'learner',
        learner_id: learnerId,
        source: 'manual_add',
      } as never,
      { onConflict: 'session_id,participant_kind,participant_id' },
    );
  if (erreurInscription) return { ok: false, error: 'Le stagiaire n’a pas pu être inscrit à la séance.' };

  return { ok: true, learnerId, dossierId };
}
