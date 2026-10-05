import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import {
  QUESTIONNAIRES_SUIVIS,
  etatEmargement,
  etatQuestionnaire,
  type EtatEmargement,
  type EtatQuestionnaire,
  type QuestionnaireSuivi,
} from './suivi-stagiaire';

export type SuiviStagiaire = {
  readonly emargement: EtatEmargement;
  readonly questionnaires: Record<QuestionnaireSuivi, EtatQuestionnaire>;
};

/**
 * Le suivi de chaque stagiaire d'une séance. L'émargement se lit sous RLS
 * (la page en garde l'accès) ; les questionnaires, rattachés à ses dossiers,
 * en service role pour ces seuls stagiaires.
 */
export async function loadSuiviStagiaires(
  sessionId: string,
  stagiaires: ReadonlyArray<{ id: string; dossierId: string | null }>,
): Promise<{ parStagiaire: Map<string, SuiviStagiaire>; avecAcquis: boolean }> {
  const ids = stagiaires.map((s) => s.id);
  const dossierIds = [...new Set(stagiaires.map((s) => s.dossierId).filter((d): d is string => Boolean(d)))];
  const [vue, { data, error }] = await Promise.all([
    loadSessionEmargement(supabaseServer(), sessionId),
    ids.length && dossierIds.length
      ? supabaseAdmin()
          .schema('app')
          .from('questionnaire_assignments')
          .select('dossier_id, recipient_learner_id, status, template:questionnaire_templates(kind)')
          .in('dossier_id', dossierIds)
          .in('recipient_learner_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw new Error(`[suivi] questionnaires illisibles : ${error.message}`);

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const assignations = ((data ?? []) as unknown as Array<{
    dossier_id: string;
    recipient_learner_id: string;
    status: string;
    template: { kind: string } | Array<{ kind: string }> | null;
  }>).map((a) => ({ dossierId: a.dossier_id, learnerId: a.recipient_learner_id, status: a.status, kind: un(a.template)?.kind ?? '' }));

  const maintenant = Date.now();
  const parStagiaire = new Map<string, SuiviStagiaire>();
  for (const s of stagiaires) {
    const siennes = assignations.filter((a) => a.learnerId === s.id && a.dossierId === s.dossierId);
    parStagiaire.set(s.id, {
      emargement: etatEmargement(vue?.sheets ?? [], s.id, maintenant),
      questionnaires: Object.fromEntries(QUESTIONNAIRES_SUIVIS.map((k) => [k, etatQuestionnaire(siennes, k)])) as Record<
        QuestionnaireSuivi,
        EtatQuestionnaire
      >,
    });
  }
  return { parStagiaire, avecAcquis: assignations.some((a) => a.kind === 'evaluation_acquis') };
}
