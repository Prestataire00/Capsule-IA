import type { Question } from './schema';

/**
 * Le score du test de positionnement d'un stagiaire (point Capsule IA du
 * 05/10/2026 : « colonne test de positionnement avec score »). Le niveau
 * déclaré sur cinq quand la fiche le demande ; sinon la moyenne des questions
 * notées, en pourcentage. Pur.
 */

export type ScorePositionnement = {
  /** Ce qu'affiche la liste : « 3/5 · Intermédiaire » ou « 72 % ». */
  readonly libelle: string;
  /** Sur 100, pour comparer et trier. */
  readonly pourcentage: number;
};

const NIVEAUX: Record<number, string> = { 1: 'Débutant', 2: 'Bases', 3: 'Intermédiaire', 4: 'Avancé', 5: 'Expert' };

export function scorePositionnement(questions: readonly Question[], reponses: Record<string, unknown> | null | undefined): ScorePositionnement | null {
  if (!reponses) return null;
  const niveau = Number(reponses.currentLevel);
  if (Number.isInteger(niveau) && niveau >= 1 && niveau <= 5) {
    return { libelle: `${niveau}/5 · ${NIVEAUX[niveau]}`, pourcentage: Math.round((niveau / 5) * 100) };
  }
  const notes = questions
    .filter((q): q is Extract<Question, { type: 'rating' }> => q.type === 'rating')
    .map((q) => ({ v: Number(reponses[q.id]), max: q.max }))
    .filter((x) => Number.isFinite(x.v) && x.max > 0 && x.v >= 1 && x.v <= x.max);
  if (notes.length === 0) return null;
  const pourcentage = Math.round((notes.reduce((t, x) => t + x.v / x.max, 0) / notes.length) * 100);
  return { libelle: `${pourcentage} %`, pourcentage };
}
