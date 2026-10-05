import { COULEUR_LABELS, COULEUR_TONS } from '../annotations';
import type { Annotation } from '../annotations-store';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Une annotation : sa couleur, ce qu'elle vise, ce qu'elle dit. L'action vient de l'appelant. */
export function AnnotationItem({
  annotation,
  cible,
  action,
}: {
  annotation: Annotation;
  /** « Question 3 », « Tout le contenu »… */
  cible: string;
  action?: React.ReactNode;
}) {
  const ton = COULEUR_TONS[annotation.couleur];
  return (
    <li
      className={`border-l-[3px] ${ton.filet} rounded-r-lg bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2 ${
        annotation.resolvedAt ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium ${ton.pastille}`}>
          {COULEUR_LABELS[annotation.couleur]}
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{cible}</span>
        {annotation.resolvedAt && (
          <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            Corrigé
          </span>
        )}
        <span className="ml-auto text-[11px] text-zinc-400 tabular-nums">
          {annotation.authorName} · {dateFmt.format(new Date(annotation.createdAt))}
        </span>
      </div>
      {annotation.extrait && (
        <p className="mt-1 text-[12px] italic text-zinc-500 dark:text-zinc-400">« {annotation.extrait} »</p>
      )}
      <p className="mt-1 text-[13px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{annotation.commentaire}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </li>
  );
}

/** Ce que vise une annotation, en clair. */
export function cibleDe(annotation: Annotation, questions: ReadonlyArray<{ id: string }>): string {
  if (annotation.questionId) {
    const i = questions.findIndex((q) => q.id === annotation.questionId);
    return i >= 0 ? `Question ${i + 1}` : 'Question retirée';
  }
  return annotation.extrait ? 'Passage' : 'Tout le contenu';
}
