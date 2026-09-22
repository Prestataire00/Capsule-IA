import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';

export type QuestionnaireStatus = 'pending' | 'in_progress' | 'completed' | 'expired';

export type ApprenantQuestionnaire = {
  assignmentId: string;
  title: string;
  kind: string;
  status: QuestionnaireStatus;
  dueAt: string | null;
};

/** Questionnaires assignés à l'apprenant (analyse des besoins, satisfaction…). */
export async function listApprenantQuestionnaires(token: string): Promise<ApprenantQuestionnaire[]> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return [];

  const admin = supabaseAdmin();
  const { data: assigns } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, due_at, template_id')
    .eq('recipient_learner_id', verified.value.learnerId)
    .order('due_at', { ascending: true });

  const rows = (assigns ?? []) as {
    id: string;
    status: QuestionnaireStatus;
    due_at: string | null;
    template_id: string;
  }[];
  if (rows.length === 0) return [];

  const templateIds = [...new Set(rows.map((r) => r.template_id))];
  const { data: templates } = await admin
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind')
    .in('id', templateIds);

  const tmap = new Map(
    ((templates ?? []) as { id: string; title: string; kind: string }[]).map((t) => [t.id, t]),
  );

  return rows.map((r) => ({
    assignmentId: r.id,
    title: tmap.get(r.template_id)?.title ?? 'Questionnaire',
    kind: tmap.get(r.template_id)?.kind ?? '',
    status: r.status,
    dueAt: r.due_at,
  }));
}

export type LoadedQuestionnaire =
  | { state: 'invalid' }
  | { state: 'forbidden' }
  | { state: 'answered'; title: string }
  | { state: 'ok'; title: string; schema: QuestionnaireSchema };

/** Charge un questionnaire assigné, en vérifiant qu'il appartient bien à l'apprenant du token. */
export async function loadApprenantQuestionnaire(
  token: string,
  assignmentId: string,
): Promise<LoadedQuestionnaire> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return { state: 'invalid' };

  const admin = supabaseAdmin();
  const { data: a, error: erreurAssignation } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, recipient_learner_id, template_id')
    .eq('id', assignmentId)
    .maybeSingle();

  // Sans cette garde, une panne rendait « lien invalide » : l'apprenant
  // renonçait à un questionnaire qui l'attendait pourtant.
  exigerLecture('questionnaire de l’apprenant', erreurAssignation);
  const assignment = a as { recipient_learner_id: string | null; template_id: string } | null;
  if (!assignment) return { state: 'invalid' };
  if (assignment.recipient_learner_id !== verified.value.learnerId) return { state: 'forbidden' };

  const [{ data: existing, error: erreurReponse }, { data: t, error: erreurModele }] = await Promise.all([
    admin.schema('app').from('questionnaire_responses').select('id').eq('assignment_id', assignmentId).maybeSingle(),
    admin.schema('app').from('questionnaire_templates').select('title, schema').eq('id', assignment.template_id).maybeSingle(),
  ]);

  // Une réponse illisible ferait rouvrir un questionnaire déjà rempli.
  exigerLecture('réponse au questionnaire', erreurReponse);
  exigerLecture('modèle de questionnaire', erreurModele);
  const tpl = t as { title: string; schema: QuestionnaireSchema } | null;
  const title = tpl?.title ?? 'Questionnaire';
  if (existing) return { state: 'answered', title };

  const schema = (tpl?.schema ?? { questions: [] }) as QuestionnaireSchema;
  return { state: 'ok', title, schema };
}

export const QUESTIONNAIRE_KIND_LABEL: Record<string, string> = {
  positionnement: 'Analyse des besoins',
  satisfaction_chaud: 'Satisfaction (à chaud)',
  satisfaction_froid: 'Satisfaction (à froid)',
  opco: 'Financeur',
  evaluation_acquis: 'Évaluation des acquis',
  custom: 'Questionnaire',
};
