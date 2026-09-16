'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { lireQuestions, rendreQuiz } from '@/features/pedagogie/store';

/**
 * Rendu d'un quiz par un apprenant.
 *
 * Le jeton fait foi — l'apprenant n'a pas de compte — et le quiz doit relever
 * d'un de SES dossiers : un identifiant deviné ne doit pas permettre de
 * répondre au quiz d'une autre formation. La correction se fait côté serveur,
 * à partir des bonnes réponses qui n'ont jamais quitté la base.
 */

const schema = z.object({
  token: z.string().min(10),
  quizId: z.string().uuid(),
  reponses: z.record(z.string(), z.array(z.number().int().min(0).max(50))),
});

export type RenduResult =
  | { ok: true; note: number; bareme: number; pourcentage: number }
  | { ok: false; error: string };

export async function repondreAuQuiz(input: {
  token: string;
  quizId: string;
  reponses: Record<string, number[]>;
}): Promise<RenduResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Réponses invalides.' };

  const verified = await verifyApprenantToken(p.data.token);
  if (!verified.ok) {
    return { ok: false, error: 'Votre lien a expiré. Demandez-en un nouveau à votre organisme.' };
  }
  const { learnerId, organizationId, dossierId } = verified.value;

  const admin = supabaseAdmin();
  const { data: dossiersData } = await admin
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('learner_id', learnerId)
    .is('deleted_at', null);
  const dossierIds = [
    ...new Set([dossierId, ...(((dossiersData ?? []) as Array<{ id: string }>).map((d) => d.id))]),
  ];

  const { data } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('id, kind, questions, pass_score, is_published, dossier_id')
    .eq('id', p.data.quizId)
    .in('dossier_id', dossierIds)
    .eq('kind', 'quiz')
    .eq('is_published', true)
    .is('deleted_at', null)
    .maybeSingle();
  const quiz = data as unknown as { questions: unknown; pass_score: number | string | null } | null;
  if (!quiz) return { ok: false, error: "Ce quiz n'est pas accessible." };

  // Un rendu déjà corrigé ne se rejoue pas : la note resterait contestable.
  const { data: dejaRendu } = await admin
    .schema('app')
    .from('exercise_submissions' as never)
    .select('id')
    .eq('exercise_id', p.data.quizId)
    .eq('learner_id', learnerId)
    .maybeSingle();
  if (dejaRendu) return { ok: false, error: 'Vous avez déjà répondu à ce quiz.' };

  const res = await rendreQuiz({
    organizationId,
    exerciseId: p.data.quizId,
    learnerId,
    questions: lireQuestions(quiz.questions),
    reponses: p.data.reponses,
    passScore: quiz.pass_score === null ? null : Number(quiz.pass_score),
  });
  if (!res.ok) return res;

  revalidatePath(`/espace/${p.data.token}/quiz`);
  return res;
}
