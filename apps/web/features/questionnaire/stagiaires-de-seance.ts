import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type StagiaireDeSeance = {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  /** Le dossier de la séance qui le compte parmi ses apprenants ; null : inscrit sur la séance seule. */
  readonly dossierId: string | null;
};

/**
 * Les stagiaires attendus sur la séance, chacun avec son dossier — titulaire
 * comme apprenant d'un dossier de groupe (un dossier pour tout un client).
 * Le chargement de la séance ne voit que le titulaire de chaque dossier : un
 * questionnaire projeté n'y trouvait qu'une personne par client.
 */
export async function stagiairesDeLaSeance(sb: Sb, sessionId: string): Promise<StagiaireDeSeance[]> {
  const [{ data: attendus }, { data: s }, { data: liens }] = await Promise.all([
    sb.schema('app').rpc('session_expected_signers', { p_session_id: sessionId }),
    sb.schema('app').from('sessions').select('dossier_id').eq('id', sessionId).maybeSingle(),
    sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', sessionId),
  ]);
  const ids = [
    ...new Set(((attendus ?? []) as Array<{ participant_kind: string; participant_id: string }>).filter((a) => a.participant_kind === 'learner').map((a) => a.participant_id)),
  ];
  const dossiers = [
    ...new Set([(s as { dossier_id: string | null } | null)?.dossier_id, ...((liens ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id)].filter(Boolean)),
  ] as string[];
  if (ids.length === 0) return [];

  const dossierDe = new Map<string, string>();
  for (const d of dossiers) {
    const { data } = await sb.schema('app').rpc('dossier_apprenants', { p_dossier_id: d });
    for (const { learner_id } of (data ?? []) as Array<{ learner_id: string }>) if (!dossierDe.has(learner_id)) dossierDe.set(learner_id, d);
  }
  const { data: l } = await sb.schema('app').from('learners').select('id, first_name, last_name').in('id', ids);
  return ((l ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
    .map((x) => ({ id: x.id, prenom: x.first_name ?? '', nom: x.last_name ?? '', dossierId: dossierDe.get(x.id) ?? null }))
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
}
