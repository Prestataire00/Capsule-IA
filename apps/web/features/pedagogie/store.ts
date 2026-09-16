import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { corrigerQuiz, baremeTotal, type QuestionQuiz, type ReponsesQuiz } from './quiz';

/**
 * Exercices et quiz d'un dossier (0080, étendus par la 0171).
 *
 * Lecture et écriture en service role : l'appelant a déjà prouvé que le
 * dossier lui est confié (`requireMyTrainerDossier`) ou qu'il en est membre.
 * Le dossier figure malgré tout dans chaque filtre — un identifiant d'exercice
 * venu du client ne suffit jamais à désigner ce qu'on modifie.
 */

export type Travail = {
  readonly id: string;
  readonly kind: 'devoir' | 'quiz';
  readonly title: string;
  readonly instructions: string | null;
  readonly questions: QuestionQuiz[];
  readonly passScore: number | null;
  readonly sessionId: string | null;
  readonly dueAt: string | null;
  readonly isPublished: boolean;
  readonly createdAt: string;
  readonly rendus: number;
  readonly corriges: number;
};

type Row = {
  id: string;
  kind: string | null;
  title: string;
  instructions: string | null;
  questions: unknown;
  pass_score: number | string | null;
  session_id: string | null;
  due_at: string | null;
  is_published: boolean;
  created_at: string;
};

/** Une valeur venue de la base n'est pas une question tant qu'elle n'a pas été vérifiée. */
export function lireQuestions(brut: unknown): QuestionQuiz[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((q): QuestionQuiz[] => {
    if (!q || typeof q !== 'object') return [];
    const o = q as Record<string, unknown>;
    const choix = Array.isArray(o.choix) ? o.choix.map((c) => String(c)) : [];
    const bonnes = Array.isArray(o.bonnes)
      ? o.bonnes.map((b) => Number(b)).filter((b) => Number.isInteger(b) && b >= 0)
      : [];
    const points = Number(o.points);
    return [
      {
        id: typeof o.id === 'string' && o.id ? o.id : randomUUID(),
        enonce: typeof o.enonce === 'string' ? o.enonce : '',
        choix,
        bonnes,
        points: Number.isFinite(points) && points > 0 ? points : 1,
      },
    ];
  });
}

export async function loadTravaux(dossierId: string): Promise<Travail[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('id, kind, title, instructions, questions, pass_score, session_id, due_at, is_published, created_at')
    .eq('dossier_id', dossierId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[pedagogie] lecture impossible', dossierId, error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const { data: rendusData } = await admin
    .schema('app')
    .from('exercise_submissions' as never)
    .select('exercise_id, status')
    .in('exercise_id', rows.map((r) => r.id));
  const rendus = new Map<string, { total: number; corriges: number }>();
  for (const s of ((rendusData ?? []) as unknown as Array<{ exercise_id: string; status: string }>)) {
    const cur = rendus.get(s.exercise_id) ?? { total: 0, corriges: 0 };
    cur.total += 1;
    if (s.status === 'graded') cur.corriges += 1;
    rendus.set(s.exercise_id, cur);
  }

  return rows.map((r) => {
    const compte = rendus.get(r.id) ?? { total: 0, corriges: 0 };
    return {
      id: r.id,
      kind: r.kind === 'quiz' ? 'quiz' : 'devoir',
      title: r.title,
      instructions: r.instructions,
      questions: lireQuestions(r.questions),
      passScore: r.pass_score === null ? null : Number(r.pass_score),
      sessionId: r.session_id,
      dueAt: r.due_at,
      isPublished: r.is_published,
      createdAt: r.created_at,
      rendus: compte.total,
      corriges: compte.corriges,
    };
  });
}

export async function loadTravail(dossierId: string, travailId: string): Promise<Travail | null> {
  const tous = await loadTravaux(dossierId);
  return tous.find((t) => t.id === travailId) ?? null;
}

export async function creerTravail(input: {
  organizationId: string;
  dossierId: string;
  userId: string;
  kind: 'devoir' | 'quiz';
  title: string;
  instructions?: string | null;
  questions?: QuestionQuiz[];
  passScore?: number | null;
  sessionId?: string | null;
  dueAt?: string | null;
  isPublished: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('exercises' as never)
    .insert({
      organization_id: input.organizationId,
      dossier_id: input.dossierId,
      kind: input.kind,
      title: input.title,
      instructions: input.instructions ?? null,
      questions: input.kind === 'quiz' ? (input.questions ?? []) : [],
      pass_score: input.kind === 'quiz' ? (input.passScore ?? null) : null,
      session_id: input.sessionId ?? null,
      due_at: input.dueAt ?? null,
      is_published: input.isPublished,
      created_by: input.userId,
    } as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, id: (data as { id: string }).id };
}

export async function majTravail(
  dossierId: string,
  travailId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('exercises' as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq('id', travailId)
    .eq('dossier_id', dossierId);
  if (error) console.error('[pedagogie] mise à jour refusée', travailId, error.message);
  return !error;
}

export async function supprimerTravail(dossierId: string, travailId: string): Promise<boolean> {
  return majTravail(dossierId, travailId, { deleted_at: new Date().toISOString() });
}

export type RenduApprenant = {
  readonly learnerId: string;
  readonly nom: string;
  readonly status: 'submitted' | 'graded';
  readonly grade: number | null;
  readonly maxGrade: number | null;
  readonly content: string | null;
  readonly feedback: string | null;
  readonly submittedAt: string;
};

export async function loadRendus(travailId: string): Promise<RenduApprenant[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('exercise_submissions' as never)
    .select('learner_id, status, grade, max_grade, content, feedback, submitted_at')
    .eq('exercise_id', travailId)
    .order('submitted_at', { ascending: true });
  const rows = (data ?? []) as unknown as Array<{
    learner_id: string;
    status: string;
    grade: number | string | null;
    max_grade: number | string | null;
    content: string | null;
    feedback: string | null;
    submitted_at: string;
  }>;
  if (rows.length === 0) return [];

  const { data: apprenants } = await admin
    .schema('app')
    .from('learners')
    .select('id, first_name, last_name')
    .in('id', rows.map((r) => r.learner_id));
  const noms = new Map(
    ((apprenants ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((l) => [
      l.id,
      `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Stagiaire',
    ]),
  );

  return rows.map((r) => ({
    learnerId: r.learner_id,
    nom: noms.get(r.learner_id) ?? 'Stagiaire',
    status: r.status === 'graded' ? 'graded' : 'submitted',
    grade: r.grade === null ? null : Number(r.grade),
    maxGrade: r.max_grade === null ? null : Number(r.max_grade),
    content: r.content,
    feedback: r.feedback,
    submittedAt: r.submitted_at,
  }));
}

/**
 * Rendu d'un quiz par un apprenant : corrigé immédiatement, et le barème est
 * figé avec la note. Modifier le quiz ensuite ne réécrit pas les copies déjà
 * rendues.
 */
export async function rendreQuiz(input: {
  organizationId: string;
  exerciseId: string;
  learnerId: string;
  questions: QuestionQuiz[];
  reponses: ReponsesQuiz;
  passScore: number | null;
}): Promise<{ ok: true; note: number; bareme: number; pourcentage: number } | { ok: false; error: string }> {
  const correction = corrigerQuiz(input.questions, input.reponses, input.passScore);

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('exercise_submissions' as never)
    .upsert(
      {
        organization_id: input.organizationId,
        exercise_id: input.exerciseId,
        learner_id: input.learnerId,
        answers: input.reponses,
        // Un quiz se corrige tout seul : la copie est rendue ET notée.
        status: 'graded',
        grade: correction.note,
        max_grade: baremeTotal(input.questions),
        submitted_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
      } as never,
      { onConflict: 'exercise_id,learner_id' },
    );
  if (error) {
    console.error('[pedagogie] rendu du quiz refusé', input.exerciseId, error.message);
    return { ok: false, error: "Votre réponse n'a pas pu être enregistrée." };
  }
  return { ok: true, note: correction.note, bareme: correction.bareme, pourcentage: correction.pourcentage };
}
