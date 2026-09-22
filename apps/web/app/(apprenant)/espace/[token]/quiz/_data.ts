import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { lireQuestions } from '@/features/pedagogie/store';
import { sansLesReponses, baremeTotal, type QuestionPourApprenant } from '@/features/pedagogie/quiz';
import { estForme, type ContenuExercice, type Forme } from '@/features/pedagogie/kinds';
import { parseTexteATrou, type Segment } from '@/features/pedagogie/cloze';

/**
 * Les quiz visibles par un apprenant (0171).
 *
 * Lecture directe plutôt que par `get_apprenant_exercises` : cette RPC ne
 * connaît ni la nature du travail ni ses questions, et l'élargir toucherait
 * l'espace apprenant existant. Ici, les bonnes réponses ne quittent jamais le
 * serveur — la page ne reçoit que les propositions.
 */

export type QuizApprenant = {
  readonly id: string;
  readonly kind: Forme;
  /** Texte à trou : segments SANS les réponses attendues. */
  readonly segments: readonly Segment[];
  readonly nbTrous: number;
  readonly contenu: ContenuExercice;
  readonly title: string;
  readonly instructions: string | null;
  readonly questions: QuestionPourApprenant[];
  readonly bareme: number;
  readonly passScore: number | null;
  readonly dueAt: string | null;
  readonly resultat: { note: number; max: number | null; pourcentage: number | null; passeLe: string } | null;
};

export type ContexteQuiz = {
  readonly learnerId: string;
  readonly organizationId: string;
  readonly quiz: QuizApprenant[];
};

export async function resolveQuizApprenant(token: string): Promise<ContexteQuiz | null> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return null;
  const { learnerId, organizationId, dossierId } = verified.value;

  const admin = supabaseAdmin();

  // Les dossiers de l'apprenant : celui du jeton, et ceux où il est titulaire.
  const { data: dossiersData, error: erreurDossiers } = await admin
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('learner_id', learnerId)
    .is('deleted_at', null);
  exigerLecture('dossiers de l’apprenant', erreurDossiers);
  const dossierIds = [
    ...new Set([dossierId, ...(((dossiersData ?? []) as Array<{ id: string }>).map((d) => d.id))]),
  ];

  const { data, error } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('id, kind, title, instructions, questions, content, pass_score, due_at')
    .in('dossier_id', dossierIds)
    .in('kind', ['quiz', 'texte_a_trou', 'cartes_memoire', 'video'])
    .eq('is_published', true)
    // Ce que la direction n'a pas validé n'atteint pas le stagiaire (0172).
    .eq('validation_status', 'valide')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  // Rendre une liste vide revenait à dire à l'apprenant qu'il n'a rien à faire,
  // alors que la lecture a échoué.
  exigerLecture('quiz de l’apprenant', error);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    kind: string | null;
    title: string;
    instructions: string | null;
    questions: unknown;
    content: unknown;
    pass_score: number | string | null;
    due_at: string | null;
  }>;
  if (rows.length === 0) return { learnerId, organizationId, quiz: [] };

  const { data: rendusData } = await admin
    .schema('app')
    .from('exercise_submissions' as never)
    .select('exercise_id, grade, max_grade, submitted_at')
    .eq('learner_id', learnerId)
    .in('exercise_id', rows.map((r) => r.id));
  const rendus = new Map(
    ((rendusData ?? []) as unknown as Array<{
      exercise_id: string;
      grade: number | string | null;
      max_grade: number | string | null;
      submitted_at: string;
    }>).map((r) => [r.exercise_id, r]),
  );

  return {
    learnerId,
    organizationId,
    quiz: rows.map((r) => {
      const kind = estForme(r.kind) ? r.kind : 'quiz';
      const contenu = (r.content ?? {}) as ContenuExercice;
      const questions = lireQuestions(r.questions);
      // Les réponses attendues restent au serveur : la page ne reçoit que la
      // forme du texte, trous compris mais vides.
      const lu = kind === 'texte_a_trou' ? parseTexteATrou(contenu.texte ?? '') : null;
      const segments = (lu?.segments ?? []).map((seg) =>
        seg.type === 'trou' ? { type: 'trou' as const, index: seg.index, reponse: '' } : seg,
      );
      const rendu = rendus.get(r.id);
      const note = rendu?.grade === null || rendu?.grade === undefined ? null : Number(rendu.grade);
      const max = rendu?.max_grade === null || rendu?.max_grade === undefined ? null : Number(rendu.max_grade);
      return {
        id: r.id,
        kind,
        segments,
        nbTrous: lu?.reponses.length ?? 0,
        contenu: kind === 'cartes_memoire' || kind === 'video' ? contenu : {},
        title: r.title,
        instructions: r.instructions,
        questions: sansLesReponses(questions),
        bareme: kind === 'texte_a_trou' ? (lu?.reponses.length ?? 0) : baremeTotal(questions),
        passScore: r.pass_score === null ? null : Number(r.pass_score),
        dueAt: r.due_at,
        resultat:
          rendu && note !== null
            ? {
                note,
                max,
                pourcentage: max && max > 0 ? Math.round((note / max) * 100) : null,
                passeLe: rendu.submitted_at,
              }
            : null,
      };
    }),
  };
}
