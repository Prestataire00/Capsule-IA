import type { ContenuExercice, Forme } from '../kinds';
import type { QuestionQuiz } from '../quiz';
import type { Annotation } from '../annotations-store';
import { COULEUR_TONS } from '../annotations';
import { TexteAnnote } from './texte-annote';

/**
 * Le contenu d'un exercice en entier — bonnes réponses comprises, c'est ce
 * qu'on relit — avec ses annotations : la question annotée prend le filet de
 * sa couleur, les passages cités sont surlignés.
 */
export function ContenuCours({
  kind,
  instructions,
  questions,
  contenu,
  annotations,
}: {
  kind: Forme;
  instructions: string | null;
  questions: readonly QuestionQuiz[];
  contenu: ContenuExercice;
  annotations: readonly Annotation[];
}) {
  const ouvertes = annotations.filter((a) => !a.resolvedAt);
  const surQuestion = (id: string) => ouvertes.filter((a) => a.questionId === id);
  const libres = ouvertes.filter((a) => !a.questionId);

  return (
    <div className="space-y-2.5 text-[13px] text-zinc-700 dark:text-zinc-300">
      {instructions && (
        <p className="whitespace-pre-wrap">
          <TexteAnnote texte={instructions} annotations={libres} />
        </p>
      )}

      {questions.length > 0 && (
        <ol className="space-y-2">
          {questions.map((q, i) => {
            const notes = surQuestion(q.id);
            const filet = notes[0] ? `border-l-[3px] pl-2.5 ${COULEUR_TONS[notes[0].couleur].filet}` : 'pl-[13px]';
            return (
              <li key={q.id} className={filet}>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {i + 1}. <TexteAnnote texte={q.enonce} annotations={[...notes, ...libres]} />
                </span>
                <span className="text-zinc-400 tabular-nums ml-1.5 text-[12px]">({q.points} pt)</span>
                <ul className="pl-4 mt-0.5 space-y-0.5">
                  {q.choix.map((c, index) => (
                    <li
                      key={index}
                      className={q.bonnes.includes(index) ? 'text-emerald-700 dark:text-emerald-400 font-medium' : ''}
                    >
                      {q.bonnes.includes(index) ? '✓ ' : '· '}
                      <TexteAnnote texte={c} annotations={[...notes, ...libres]} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {kind === 'texte_a_trou' && contenu.texte && (
        <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <TexteAnnote texte={contenu.texte} annotations={libres} />
        </p>
      )}

      {contenu.cartes && contenu.cartes.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-2">
          {contenu.cartes.map((c, i) => (
            <li key={i} className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-2.5">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                <TexteAnnote texte={c.recto} annotations={libres} />
              </p>
              <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                <TexteAnnote texte={c.verso} annotations={libres} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {contenu.url && (
        <a href={contenu.url} target="_blank" rel="noopener noreferrer" className="text-orange-600 dark:text-orange-400 hover:underline break-all">
          {contenu.url}
        </a>
      )}
      {contenu.description && (
        <p className="whitespace-pre-wrap">
          <TexteAnnote texte={contenu.description} annotations={libres} />
        </p>
      )}
    </div>
  );
}
