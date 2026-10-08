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

export type DetailQuestionnaire = {
  /** La réponse, quand il a répondu : pour l'ouvrir. */
  readonly reponseId: string | null;
  readonly reponduLe: string | null;
  /** Le questionnaire déjà adressé, à renvoyer tel quel. */
  readonly templateId: string | null;
};

export type SuiviStagiaire = {
  readonly emargement: EtatEmargement;
  readonly questionnaires: Record<QuestionnaireSuivi, EtatQuestionnaire>;
  readonly details: Record<QuestionnaireSuivi, DetailQuestionnaire>;
  /** Son dossier dans cette séance : sans lui, pas d'envoi individuel. */
  readonly dossierId: string | null;
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
): Promise<{ parStagiaire: Map<string, SuiviStagiaire>; avecAcquis: boolean; modeles: Record<QuestionnaireSuivi, string | null> }> {
  // Le dossier de chacun, apprenants des dossiers de groupe compris : la séance
  // ne connaît que le titulaire de chaque dossier, et les autres passaient pour
  // « sans dossier » — leurs réponses ne remontaient pas (constat du 2026-10-08).
  const resolus = new Map((await stagiairesDeLaSeance(supabaseAdmin() as never, sessionId)).map((s) => [s.id, s.dossierId]));
  stagiaires = stagiaires.map((s) => ({ id: s.id, dossierId: s.dossierId ?? resolus.get(s.id) ?? null }));
  const ids = stagiaires.map((s) => s.id);
  const dossierIds = [...new Set(stagiaires.map((s) => s.dossierId).filter((d): d is string => Boolean(d)))];
  const sansDossier = stagiaires.filter((s) => !s.dossierId).map((s) => s.id);
  const colonnes = 'id, dossier_id, recipient_learner_id, status, template_id, template:questionnaire_templates(kind)';
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
    id: string;
    status: string;
    template_id: string;
    template: { kind: string } | Array<{ kind: string }> | null;
  }>).map((a) => ({
    id: a.id,
    templateId: a.template_id,
    dossierId: a.dossier_id,
    learnerId: a.recipient_learner_id,
    status: a.status,
    kind: a.template_id === satisfactionId ? 'satisfaction_chaud' : (un(a.template)?.kind ?? ''),
  }));

  // Les réponses des fiches remplies, pour les ouvrir d'un clic.
  const remplies = assignations.filter((a) => a.status === 'completed').map((a) => a.id);
  const { data: reponses } = remplies.length
    ? await supabaseAdmin().schema('app').from('questionnaire_responses').select('id, assignment_id, submitted_at').in('assignment_id', remplies)
    : { data: [] };
  const reponseDe = new Map(((reponses ?? []) as Array<{ id: string; assignment_id: string; submitted_at: string | null }>).map((r) => [r.assignment_id, r]));

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
      details: Object.fromEntries(
        QUESTIONNAIRES_SUIVIS.map((k) => {
          const duType = siennes.filter((a) => a.kind === k && a.status !== 'expired');
          const faite = duType.find((a) => a.status === 'completed');
          const r = faite ? reponseDe.get(faite.id) : undefined;
          return [k, { reponseId: r?.id ?? null, reponduLe: r?.submitted_at ?? null, templateId: (faite ?? duType[0])?.templateId ?? null }];
        }),
      ) as Record<QuestionnaireSuivi, DetailQuestionnaire>,
      dossierId: s.dossierId,
      positionnement: scores.get(cleStagiaire(s.id, s.dossierId)) ?? null,
    });
  }
  return { parStagiaire, avecAcquis: assignations.some((a) => a.kind === 'evaluation_acquis'), modeles: await modelesParDefaut(orgId, sessionId, satisfactionId) };
}

/**
 * Le questionnaire à envoyer à qui n'en a pas encore : la satisfaction de
 * l'organisme, la fiche besoin de la formation (sinon la fiche courante), le
 * premier questionnaire à froid. Les acquis passent par les quiz : pas d'envoi d'ici.
 */
async function modelesParDefaut(orgId: string | null, sessionId: string, satisfactionId: string | null): Promise<Record<QuestionnaireSuivi, string | null>> {
  const vide = { positionnement: null, evaluation_acquis: null, satisfaction_chaud: satisfactionId, satisfaction_froid: null };
  if (!orgId) return vide;
  const sb = supabaseAdmin();
  const [{ data: s }, { data: t }] = await Promise.all([
    sb.schema('app').from('sessions').select('formation_id').eq('id', sessionId).maybeSingle(),
    sb
      .schema('app')
      .from('questionnaire_templates')
      .select('id, kind, organization_id, formation_id' as never)
      .in('kind', ['positionnement', 'satisfaction_froid'] as never)
      .eq('is_active', true)
      .is('deleted_at', null)
      .or(`organization_id.eq.${orgId},organization_id.is.null`),
  ]);
  const formation = (s as { formation_id: string | null } | null)?.formation_id ?? null;
  const modeles = (t ?? []) as unknown as Array<{ id: string; kind: string; organization_id: string | null; formation_id: string | null }>;
  // Le plus proche d'abord : celui de la formation, puis celui de l'organisme, puis l'intégré.
  const rang = (m: (typeof modeles)[number]) => (m.formation_id && m.formation_id === formation ? 0 : m.formation_id ? 9 : m.organization_id ? 1 : 2);
  const meilleur = (kind: string) => modeles.filter((m) => m.kind === kind && rang(m) < 9).sort((a, b) => rang(a) - rang(b))[0]?.id ?? null;
  return { ...vide, positionnement: meilleur('positionnement'), satisfaction_froid: meilleur('satisfaction_froid') };
}
