import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { corrigerQuiz, baremeTotal, type QuestionQuiz, type ReponsesQuiz } from './quiz';
import { estForme, type ContenuExercice, type Forme } from './kinds';
import { corrigerTexteATrou, parseTexteATrou } from './cloze';

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
  readonly kind: Forme;
  readonly contenu: ContenuExercice;
  readonly validationStatus: 'en_attente' | 'valide' | 'refuse';
  readonly rejectionReason: string | null;
  readonly aiAssisted: boolean;
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
  content: unknown;
  validation_status: string | null;
  rejection_reason: string | null;
  ai_assisted: boolean | null;
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

/** Ancrage d'un cours : la séance qu'il prépare, ou le dossier qu'il suit (0174). */
export type Ancrage = { readonly type: 'seance' | 'dossier'; readonly id: string };

const colonne = (a: Ancrage) => (a.type === 'seance' ? 'session_id' : 'dossier_id');

export async function loadTravaux(ancrage: Ancrage): Promise<Travail[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('exercises' as never)
    .select(
      'id, kind, title, instructions, questions, pass_score, session_id, due_at, is_published, created_at, content, validation_status, rejection_reason, ai_assisted',
    )
    .eq(colonne(ancrage), ancrage.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[pedagogie] lecture impossible', ancrage.id, error.message);
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
      kind: estForme(r.kind) ? r.kind : 'devoir',
      contenu: (r.content ?? {}) as ContenuExercice,
      // Une valeur inconnue est traitée comme « à valider » : on ne diffuse
      // jamais par défaut (même règle que les supports, 0165).
      validationStatus:
        r.validation_status === 'valide' || r.validation_status === 'refuse' ? r.validation_status : 'en_attente',
      rejectionReason: r.rejection_reason,
      aiAssisted: Boolean(r.ai_assisted),
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

export async function loadTravail(ancrage: Ancrage, travailId: string): Promise<Travail | null> {
  const tous = await loadTravaux(ancrage);
  return tous.find((t) => t.id === travailId) ?? null;
}

export async function creerTravail(input: {
  organizationId: string;
  dossierId: string | null;
  /** Séance à laquelle le cours est rattaché quand c'est elle qu'on prépare. */
  sessionIdAncrage?: string | null;
  userId: string;
  kind: Forme;
  contenu?: ContenuExercice;
  aiAssisted?: boolean;
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
      content: input.contenu ?? {},
      ai_assisted: input.aiAssisted ?? false,
      title: input.title,
      instructions: input.instructions ?? null,
      questions: input.kind === 'quiz' || input.kind === 'video' ? (input.questions ?? []) : [],
      pass_score: input.kind === 'quiz' ? (input.passScore ?? null) : null,
      session_id: input.sessionIdAncrage ?? input.sessionId ?? null,
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
  ancrage: Ancrage,
  travailId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('exercises' as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq('id', travailId)
    .eq(colonne(ancrage), ancrage.id);
  if (error) console.error('[pedagogie] mise à jour refusée', travailId, error.message);
  return !error;
}

export async function supprimerTravail(ancrage: Ancrage, travailId: string): Promise<boolean> {
  return majTravail(ancrage, travailId, { deleted_at: new Date().toISOString() });
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

/**
 * Rendu d'un texte à trou : un point par trou, corrigé sur les réponses
 * attendues telles qu'elles sont en base — jamais sur ce que le navigateur
 * renvoie.
 */
export async function rendreTexteATrou(input: {
  organizationId: string;
  exerciseId: string;
  learnerId: string;
  texte: string;
  donnees: string[];
}): Promise<{ ok: true; note: number; bareme: number; pourcentage: number } | { ok: false; error: string }> {
  const attendues = parseTexteATrou(input.texte).reponses;
  const correction = corrigerTexteATrou(attendues, input.donnees);

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('exercise_submissions' as never)
    .upsert(
      {
        organization_id: input.organizationId,
        exercise_id: input.exerciseId,
        learner_id: input.learnerId,
        answers: { trous: input.donnees },
        status: 'graded',
        grade: correction.note,
        max_grade: correction.bareme,
        submitted_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
      } as never,
      { onConflict: 'exercise_id,learner_id' },
    );
  if (error) {
    console.error('[pedagogie] rendu du texte à trou refusé', input.exerciseId, error.message);
    return { ok: false, error: "Votre réponse n'a pas pu être enregistrée." };
  }
  return { ok: true, note: correction.note, bareme: correction.bareme, pourcentage: correction.pourcentage };
}
