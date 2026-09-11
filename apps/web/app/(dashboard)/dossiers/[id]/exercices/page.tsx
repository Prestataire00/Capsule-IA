// ARCHETYPE: workflow
// Justification: gestion des exercices d'un dossier — création, suivi des soumissions, correction.

import { notFound } from 'next/navigation';
import { PenLine, User, FileDown, Eye, EyeOff } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ExerciseForm } from './exercise-form';
import { GradeForm } from './grade-form';

export const dynamic = 'force-dynamic';

type ExerciseRow = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  is_published: boolean;
  attachment_path: string | null;
  organization_id: string;
};

type SubmissionRow = {
  id: string;
  exercise_id: string;
  learner_id: string;
  content: string | null;
  file_path: string | null;
  status: 'submitted' | 'graded';
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  learner_first_name: string | null;
  learner_last_name: string | null;
};

export default async function ExercicesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  // Vérifie que le dossier existe + récupère organization_id
  const { data: dossierRaw } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!dossierRaw) notFound();
  const dossier = dossierRaw as { id: string; organization_id: string };

  // Liste les exercices non supprimés du dossier
  const { data: exercisesRaw } = await sb
    .schema('app')
    .from('exercises' as never)
    .select('id, title, instructions, due_at, is_published, attachment_path, organization_id')
    .eq('dossier_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const exercises = (exercisesRaw ?? []) as ExerciseRow[];

  // Liste les soumissions pour ces exercices + jointure learner
  let submissions: SubmissionRow[] = [];
  if (exercises.length > 0) {
    const exerciseIds = exercises.map((e) => e.id);
    const { data: subsRaw } = await sb
      .schema('app')
      .from('exercise_submissions' as never)
      .select(
        'id, exercise_id, learner_id, content, file_path, status, grade, feedback, submitted_at, learners!inner(first_name, last_name)',
      )
      .in('exercise_id', exerciseIds);

    type SubRawRow = {
      id: string;
      exercise_id: string;
      learner_id: string;
      content: string | null;
      file_path: string | null;
      status: 'submitted' | 'graded';
      grade: number | null;
      feedback: string | null;
      submitted_at: string;
      learners: { first_name: string; last_name: string } | null;
    };

    submissions = ((subsRaw ?? []) as SubRawRow[]).map((s) => ({
      id: s.id,
      exercise_id: s.exercise_id,
      learner_id: s.learner_id,
      content: s.content,
      file_path: s.file_path,
      status: s.status,
      grade: s.grade,
      feedback: s.feedback,
      submitted_at: s.submitted_at,
      learner_first_name: s.learners?.first_name ?? null,
      learner_last_name: s.learners?.last_name ?? null,
    }));
  }

  const submissionsByExercise = submissions.reduce<Record<string, SubmissionRow[]>>((acc, s) => {
    (acc[s.exercise_id] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
            <PenLine className="w-4 h-4" />
          </span>
          <div>
            <SectionLabel className="mb-1.5">Exercices</SectionLabel>
            <p className="flex items-center gap-2 flex-wrap tabular-nums">
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${ACCENTS.orange.soft}`}>
                {exercises.length} exercice{exercises.length > 1 ? 's' : ''}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${ACCENTS.rose.soft}`}>
                {submissions.length} soumission{submissions.length > 1 ? 's' : ''}
              </span>
            </p>
          </div>
        </div>
        <ExerciseForm dossierId={params.id} organizationId={dossier.organization_id} />
      </header>

      {exercises.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState icon={PenLine} title="Aucun exercice." description="Créez-en un ci-dessus." />
        </div>
      ) : (
        <div className="space-y-4">
          {exercises.map((ex) => {
            const subs = submissionsByExercise[ex.id] ?? [];
            const gradedCount = subs.filter((s) => s.status === 'graded').length;

            return (
              <section
                key={ex.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm"
              >
                {/* Header exercice */}
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-start gap-3">
                    <PenLine className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-extrabold text-zinc-900 dark:text-zinc-100">{ex.title}</p>
                        <StatusPill tone={ex.is_published ? 'success' : 'neutral'}>
                          {ex.is_published ? 'Publié' : 'Brouillon'}
                        </StatusPill>
                        {subs.length > 0 && (
                          <StatusPill tone="info" className="tabular-nums">
                            {gradedCount}/{subs.length} corrigé{subs.length > 1 ? 's' : ''}
                          </StatusPill>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {ex.due_at && (
                          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                            Échéance : {new Date(ex.due_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                        {ex.attachment_path && (
                          <span className="text-[12px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1">
                            <FileDown className="w-3 h-3" />
                            Énoncé joint
                          </span>
                        )}
                      </div>
                      {ex.instructions && (
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{ex.instructions}</p>
                      )}
                    </div>
                    {/* Toggle publication */}
                    <PublishToggleForm exerciseId={ex.id} isPublished={ex.is_published} dossierId={params.id} />
                  </div>
                </div>

                {/* Soumissions */}
                {subs.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-[12px] text-zinc-400 dark:text-zinc-600">Aucune soumission.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {subs.map((sub) => {
                      const learnerName = [sub.learner_first_name, sub.learner_last_name]
                        .filter(Boolean)
                        .join(' ') || 'Apprenant';

                      return (
                        <li key={sub.id} className="px-5 py-3.5">
                          <div className="flex items-start gap-3">
                            <User className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">{learnerName}</p>
                                <StatusPill tone={sub.status === 'graded' ? 'success' : 'warning'}>
                                  {sub.status === 'graded' ? 'Corrigé' : 'À corriger'}
                                </StatusPill>
                                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                  {new Date(sub.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                </span>
                              </div>

                              {sub.content && (
                                <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">{sub.content}</p>
                              )}

                              {sub.file_path && (
                                <a
                                  href={`/api/dossiers/${params.id}/submission/${sub.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:underline mt-1"
                                >
                                  <FileDown className="w-3 h-3" />
                                  Télécharger le fichier
                                </a>
                              )}

                              {sub.status === 'graded' && (sub.grade !== null || sub.feedback) && (
                                <div className="mt-2 space-y-0.5">
                                  {sub.grade !== null && (
                                    <p className="text-[12px] text-zinc-700 dark:text-zinc-300">
                                      Note : <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{sub.grade}</span>
                                    </p>
                                  )}
                                  {sub.feedback && (
                                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2">{sub.feedback}</p>
                                  )}
                                </div>
                              )}

                              <GradeForm
                                submissionId={sub.id}
                                currentGrade={sub.grade}
                                currentFeedback={sub.feedback}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline server action for toggling publication (direct supabaseServer — auth via session cookie)
async function togglePublishAction(exerciseId: string, nextValue: boolean, dossierId: string) {
  'use server';
  const { supabaseServer: sb } = await import('@/shared/lib/supabase/server');
  const { revalidatePath } = await import('next/cache');
  const client = sb();
  await client
    .schema('app')
    .from('exercises' as never)
    .update({ is_published: nextValue, updated_at: new Date().toISOString() } as never)
    .eq('id', exerciseId);
  revalidatePath(`/dossiers/${dossierId}/exercices`);
}

function PublishToggleForm({
  exerciseId,
  isPublished,
  dossierId,
}: {
  exerciseId: string;
  isPublished: boolean;
  dossierId: string;
}) {
  return (
    <form action={togglePublishAction.bind(null, exerciseId, !isPublished, dossierId)}>
      <button
        type="submit"
        title={isPublished ? 'Masquer aux apprenants' : 'Publier aux apprenants'}
        className="inline-flex items-center gap-1.5 h-8 text-[12px] font-semibold px-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 transition"
      >
        {isPublished ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {isPublished ? 'Masquer' : 'Publier'}
      </button>
    </form>
  );
}
