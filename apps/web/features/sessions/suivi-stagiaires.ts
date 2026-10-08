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
import { cleStagiaire, scoresPositionnement } from '@/features/questionnaire/scores-positionnement';
import type { ScorePositionnement } from '@/features/questionnaire/score-positionnement';
import { stagiairesDeLaSeance } from '@/features/questionnaire/stagiaires-de-seance';
import { modeleSatisfaction } from '@/features/questionnaire/satisfaction';

export type SuiviStagiaire = {
  readonly emargement: EtatEmargement;
  readonly questionnaires: Record<QuestionnaireSuivi, EtatQuestionnaire>;
  /** Score du test de positionnement, une fois rempli. */
  readonly positionnement: ScorePositionnement | null;
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
  // Le dossier de chacun, apprenants des dossiers de groupe compris : la séance
  // ne connaît que le titulaire de chaque dossier, et les autres passaient pour
  // « sans dossier » — leurs réponses ne remontaient pas (constat du 2026-10-08).
  const resolus = new Map((await stagiairesDeLaSeance(supabaseAdmin() as never, sessionId)).map((s) => [s.id, s.dossierId]));
  stagiaires = stagiaires.map((s) => ({ id: s.id, dossierId: s.dossierId ?? resolus.get(s.id) ?? null }));
  const ids = stagiaires.map((s) => s.id);
  const dossierIds = [...new Set(stagiaires.map((s) => s.dossierId).filter((d): d is string => Boolean(d)))];
  const sansDossier = stagiaires.filter((s) => !s.dossierId).map((s) => s.id);
  const colonnes = 'dossier_id, recipient_learner_id, status, template_id, template:questionnaire_templates(kind)';
  // Le questionnaire de satisfaction de l'organisme compte comme « à chaud », quel que soit son type en base.
  const { data: seance } = await supabaseAdmin().schema('app').from('sessions').select('organization_id').eq('id', sessionId).maybeSingle();
  const orgId = (seance as { organization_id: string } | null)?.organization_id ?? null;
  const satisfactionId = orgId ? (await modeleSatisfaction(supabaseAdmin() as never, orgId)).id : null;
  const [vue, { data, error }, { data: dataSans, error: errSans }, scores] = await Promise.all([
    loadSessionEmargement(supabaseServer(), sessionId),
    ids.length && dossierIds.length
      ? supabaseAdmin().schema('app').from('questionnaire_assignments').select(colonnes).in('dossier_id', dossierIds).in('recipient_learner_id', ids)
      : Promise.resolve({ data: [], error: null }),
    // Inscrits directement à la séance : leurs fiches n'ont pas de dossier.
    sansDossier.length
      ? supabaseAdmin().schema('app').from('questionnaire_assignments').select(colonnes).is('dossier_id', null).in('recipient_learner_id', sansDossier)
      : Promise.resolve({ data: [], error: null }),
    scoresPositionnement(supabaseAdmin() as never, stagiaires.map((s) => ({ learnerId: s.id, dossierId: s.dossierId }))),
  ]);
  if (error || errSans) throw new Error(`[suivi] questionnaires illisibles : ${(error ?? errSans)?.message}`);

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const assignations = ([...(data ?? []), ...(dataSans ?? [])] as unknown as Array<{
    dossier_id: string | null;
    recipient_learner_id: string;
    status: string;
    template_id: string;
    template: { kind: string } | Array<{ kind: string }> | null;
  }>).map((a) => ({
    dossierId: a.dossier_id,
    learnerId: a.recipient_learner_id,
    status: a.status,
    kind: a.template_id === satisfactionId ? 'satisfaction_chaud' : (un(a.template)?.kind ?? ''),
  }));

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
      positionnement: scores.get(cleStagiaire(s.id, s.dossierId)) ?? null,
    });
  }
  return { parStagiaire, avecAcquis: assignations.some((a) => a.kind === 'evaluation_acquis') };
}
