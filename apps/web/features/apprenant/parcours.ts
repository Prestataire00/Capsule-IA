// Domaine pur (zéro import next/supabase/react) : construit le « parcours » de l'apprenant
// à partir des données déjà chargées (modules, supports, exercices, questionnaires, sessions)
// et des signaux de progression existants (ressources consultées, exercices rendus…).
// Aucun nouveau modèle : progression dérivée, pas un LMS.

export type ParcoursResource = { id: string; title: string; consulted: boolean };
export type ParcoursExercise = {
  id: string;
  title: string;
  status: 'todo' | 'submitted' | 'graded';
};

export type ParcoursModule = {
  id: string;
  title: string;
  position: number;
  resources: ParcoursResource[];
  exercises: ParcoursExercise[];
  /** Activités traçables faites / total dans ce module. */
  doneItems: number;
  totalItems: number;
  /** Progression du module en %, ou null si aucune activité traçable. */
  pct: number | null;
  completed: boolean;
};

export type ParcoursOverview = {
  modules: ParcoursModule[];
  /** Exercices non rattachés à un module. */
  orphanExercises: ParcoursExercise[];
  overall: { done: number; total: number; pct: number };
};

type ModuleInput = { id: string; title: string; position: number };
type SupportInput = { moduleId: string; resources: { id: string; title: string }[] };
type ExerciseInput = {
  id: string;
  title: string;
  moduleId: string | null;
  submission?: { status: 'submitted' | 'graded' } | null;
};

const exerciseStatus = (e: ExerciseInput): ParcoursExercise['status'] =>
  e.submission?.status === 'graded' ? 'graded' : e.submission?.status === 'submitted' ? 'submitted' : 'todo';

const exerciseDone = (s: ParcoursExercise['status']) => s === 'submitted' || s === 'graded';

export function buildParcours(input: {
  modules: ModuleInput[];
  supports: SupportInput[];
  exercises: ExerciseInput[];
  questionnaires: { status: string }[];
  sessions: { status: string }[];
  consultedResourceIds: ReadonlySet<string>;
}): ParcoursOverview {
  const supportsByModule = new Map<string, SupportInput['resources']>();
  for (const s of input.supports) supportsByModule.set(s.moduleId, s.resources);

  const exercisesByModule = new Map<string, ExerciseInput[]>();
  const orphan: ParcoursExercise[] = [];
  for (const e of input.exercises) {
    if (e.moduleId) {
      const arr = exercisesByModule.get(e.moduleId) ?? [];
      arr.push(e);
      exercisesByModule.set(e.moduleId, arr);
    } else {
      orphan.push({ id: e.id, title: e.title, status: exerciseStatus(e) });
    }
  }

  let overallDone = 0;
  let overallTotal = 0;

  const modules: ParcoursModule[] = [...input.modules]
    .sort((a, b) => a.position - b.position)
    .map((m) => {
      const resources: ParcoursResource[] = (supportsByModule.get(m.id) ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        consulted: input.consultedResourceIds.has(r.id),
      }));
      const exercises: ParcoursExercise[] = (exercisesByModule.get(m.id) ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        status: exerciseStatus(e),
      }));

      const total = resources.length + exercises.length;
      const done =
        resources.filter((r) => r.consulted).length + exercises.filter((e) => exerciseDone(e.status)).length;
      overallDone += done;
      overallTotal += total;

      return {
        id: m.id,
        title: m.title,
        position: m.position,
        resources,
        exercises,
        doneItems: done,
        totalItems: total,
        pct: total === 0 ? null : Math.round((done / total) * 100),
        completed: total > 0 && done === total,
      };
    });

  // Activités de dossier (non rattachées à un module) : exercices orphelins + questionnaires + sessions.
  overallDone += orphan.filter((e) => exerciseDone(e.status)).length;
  overallTotal += orphan.length;
  overallDone += input.questionnaires.filter((q) => q.status === 'completed').length;
  overallTotal += input.questionnaires.length;
  overallDone += input.sessions.filter((s) => s.status === 'done').length;
  overallTotal += input.sessions.length;

  return {
    modules,
    orphanExercises: orphan,
    overall: {
      done: overallDone,
      total: overallTotal,
      pct: overallTotal === 0 ? 0 : Math.round((overallDone / overallTotal) * 100),
    },
  };
}
