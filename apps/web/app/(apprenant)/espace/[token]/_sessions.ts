import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';

/**
 * Les séances auxquelles donne droit un jeton d'espace apprenant.
 *
 * Supports de cours et messagerie s'ouvrent séance par séance : sans cette
 * liste, un identifiant de séance collé dans l'URL suffirait à lire le fil
 * d'une formation qui n'est pas la sienne. C'est la seule barrière.
 */

export type SeanceAutorisee = {
  readonly id: string;
  readonly title: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
};

export type AccesApprenant = {
  readonly learnerId: string;
  readonly learnerName: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly seances: readonly SeanceAutorisee[];
};

export async function resolveAccesApprenant(token: string): Promise<AccesApprenant | null> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return null;
  const { learnerId, organizationId, dossierId } = verified.value;

  const admin = supabaseAdmin();

  // Une séance atteint l'apprenant par son dossier (direct ou lié) ou par une
  // inscription nominative : les trois chemins comptent.
  const [parDossier, parJonction, parParticipation] = await Promise.all([
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId),
    admin.schema('app').from('session_dossiers' as never).select('session_id').eq('dossier_id', dossierId),
    admin
      .schema('app')
      .from('session_participants')
      .select('session_id')
      .eq('learner_id', learnerId)
      .eq('participant_kind', 'learner'),
  ]);

  // Les trois chemins doivent répondre : un seul en panne retirerait des
  // séances à l'apprenant sans que rien ne le signale.
  exigerLecture('séances du dossier', parDossier.error);
  exigerLecture('séances liées au dossier', parJonction.error);
  exigerLecture('inscriptions nominatives', parParticipation.error);

  const ids = new Set<string>();
  for (const r of (parDossier.data ?? []) as Array<{ id: string }>) ids.add(r.id);
  for (const r of (parJonction.data ?? []) as unknown as Array<{ session_id: string }>) ids.add(r.session_id);
  for (const r of (parParticipation.data ?? []) as Array<{ session_id: string }>) ids.add(r.session_id);

  const { data: learnerRow, error: erreurApprenant } = await admin
    .schema('app')
    .from('learners')
    .select('first_name, last_name')
    .eq('id', learnerId)
    .maybeSingle();
  exigerLecture('apprenant', erreurApprenant);
  const l = learnerRow as { first_name: string | null; last_name: string | null } | null;

  const { data: seancesData, error: erreurSeances } = ids.size
    ? await admin
        .schema('app')
        .from('sessions')
        .select('id, title, starts_at, ends_at')
        .in('id', [...ids])
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true })
    : { data: [], error: null };
  exigerLecture('séances de l’apprenant', erreurSeances);

  return {
    learnerId,
    learnerName: `${l?.first_name ?? ''} ${l?.last_name ?? ''}`.trim() || 'Participant',
    organizationId,
    dossierId,
    seances: ((seancesData ?? []) as Array<{ id: string; title: string | null; starts_at: string; ends_at: string }>).map(
      (s) => ({ id: s.id, title: s.title, startsAt: s.starts_at, endsAt: s.ends_at }),
    ),
  };
}
