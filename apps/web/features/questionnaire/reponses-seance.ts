import type { Question } from './schema';

/**
 * Lire les réponses d'une évaluation : chaque réponse telle qu'on la dit, et
 * la synthèse d'une question sur l'ensemble des répondants. Pur, sans base.
 */

const NIVEAUX: Record<number, string> = { 1: 'Débutant', 2: 'Bases', 3: 'Intermédiaire', 4: 'Avancé', 5: 'Expert' };

export function valeurLisible(q: Question, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (q.id === 'currentLevel' && typeof v === 'number') return NIVEAUX[v] ?? String(v);
  if (q.type === 'rating') return `${String(v)} / ${q.max}`;
  if (q.type === 'nps') return `${String(v)} / 10`;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

const arrondi = (n: number) => Math.round(n * 10) / 10;

/** « Moyenne 3,8 / 5 », « Oui 12 · Non 5 », « 9 réponses » — selon la question. */
export function syntheseDesReponses(
  questions: readonly Question[],
  reponses: ReadonlyArray<Record<string, unknown>>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const q of questions) {
    const valeurs = reponses.map((r) => r[q.id]).filter((v) => v !== undefined && v !== null && v !== '');
    if (valeurs.length === 0) continue;
    if (q.type === 'rating' || q.type === 'nps') {
      const nombres = valeurs.map(Number).filter((n) => Number.isFinite(n));
      if (nombres.length === 0) continue;
      const moyenne = arrondi(nombres.reduce((s, n) => s + n, 0) / nombres.length);
      out.set(q.id, `Moyenne ${String(moyenne).replace('.', ',')} / ${q.type === 'nps' ? 10 : q.max}`);
    } else if (q.type === 'choice') {
      const compte = new Map<string, number>();
      for (const v of valeurs) compte.set(String(v), (compte.get(String(v)) ?? 0) + 1);
      out.set(
        q.id,
        [...compte.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([o, n]) => `${o} ${n}`)
          .join(' · '),
      );
    } else {
      out.set(q.id, `${valeurs.length} réponse${valeurs.length > 1 ? 's' : ''}`);
    }
  }
  return out;
}
