'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { validateAnswers, type Answers, type QuestionnaireSchema } from '@/features/questionnaire/schema';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id || !ADMIN_ROLES.includes(data.role)) return null;
  return data.organization_id as string;
}

/** Saisie manuelle d'une réponse par un admin (apprenant ayant répondu papier/téléphone). */
export async function saveManualResponse(formData: FormData): Promise<void> {
  const assignmentId = (formData.get('assignmentId') as string | null) ?? '';
  const dossierId = (formData.get('dossierId') as string | null) ?? '';
  const base = `/dossiers/${dossierId}/questionnaires`;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const orgId = await resolveAdminOrgId(user!.id);
  if (!orgId || !assignmentId) redirect(`${base}?error=forbidden`);

  const admin = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: a } = await (admin as any)
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, template_id, dossier_id')
    .eq('id', assignmentId)
    .maybeSingle();
  const assignment = a as { organization_id: string; template_id: string; dossier_id: string } | null;
  if (!assignment || assignment.organization_id !== orgId) redirect(`${base}?error=forbidden`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existing) redirect(`${base}?saisie=already`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: t } = await (admin as any)
    .schema('app')
    .from('questionnaire_templates')
    .select('schema')
    .eq('id', assignment!.template_id)
    .maybeSingle();
  const schema = ((t as { schema: QuestionnaireSchema } | null)?.schema ?? {}) as QuestionnaireSchema;

  const answers: Answers = {};
  for (const q of questionsDuSchema(schema)) {
    const raw = formData.get(q.id);
    if (raw === null || raw === '') continue;
    answers[q.id] = q.type === 'nps' || q.type === 'rating' ? Number(raw) : String(raw);
  }
  const validation = validateAnswers(schema, answers);
  if (!validation.ok) redirect(`${base}/${assignmentId}/saisie?error=incomplete`);

  const ratings = questionsDuSchema(schema)
    .filter((q) => q.type === 'rating')
    .map((q) => Number(answers[q.id]))
    .filter((n) => Number.isFinite(n));
  const npsQ = questionsDuSchema(schema).find((q) => q.type === 'nps');
  const nps = npsQ && answers[npsQ.id] !== undefined ? Number(answers[npsQ.id]) : null;
  const score = ratings.length ? (ratings.reduce((s, n) => s + n, 0) / ratings.length) * 20 : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (admin as any)
    .schema('app')
    .from('questionnaire_responses')
    .insert({
      organization_id: assignment!.organization_id,
      assignment_id: assignmentId,
      template_id: assignment!.template_id,
      dossier_id: assignment!.dossier_id,
      answers,
      score,
      nps,
      metadata: { input_by: 'admin', input_user_id: user!.id },
    });
  if (insErr) redirect(`${base}/${assignmentId}/saisie?error=db`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' })
    .eq('id', assignmentId);

  revalidatePath(base);
  redirect(`${base}?saisie=ok`);
}
