import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type ApprenantExercise = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  moduleId: string | null;
  hasAttachment: boolean;
  submission: {
    status: 'submitted' | 'graded';
    grade: number | null;
    feedback: string | null;
    submittedAt: string;
    hasFile: boolean;
  } | null;
};

type RpcRow = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  module_id: string | null;
  has_attachment: boolean;
  submission: {
    status: 'submitted' | 'graded';
    grade: number | null;
    feedback: string | null;
    submitted_at: string;
    has_file: boolean;
  } | null;
};

export async function resolveApprenantExercises(token: string): Promise<ApprenantExercise[]> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return [];

  const sb = supabaseServer();
  const { data, error } = await sb.rpc(
    'get_apprenant_exercises' as never,
    { p_learner_id: verified.value.learnerId } as never,
  );
  if (error || !data) return [];

  const rows = data as unknown as RpcRow[];
  if (!Array.isArray(rows)) return [];

  return rows.map((x) => ({
    id: x.id,
    title: x.title,
    instructions: x.instructions,
    dueAt: x.due_at,
    moduleId: x.module_id,
    hasAttachment: x.has_attachment,
    submission: x.submission
      ? {
          status: x.submission.status,
          grade: x.submission.grade,
          feedback: x.submission.feedback,
          submittedAt: x.submission.submitted_at,
          hasFile: x.submission.has_file,
        }
      : null,
  }));
}
