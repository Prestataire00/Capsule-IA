import { MessageSquareWarning } from 'lucide-react';
import type { Annotation } from '@/features/pedagogie/annotations-store';
import type { Travail } from '@/features/pedagogie/store';
import { AnnotationItem, cibleDe } from '@/features/pedagogie/ui/annotation-item';
import { ContenuCours } from '@/features/pedagogie/ui/contenu-cours';
import { MarquerCorrigee } from './corrigee.client';

/**
 * Ce que la relecture a relevé sur un contenu du formateur : chaque point en
 * couleur, à marquer corrigé, et le contenu avec les passages surlignés.
 */
export function RetoursRelecture({
  annotations,
  travail,
}: {
  annotations: readonly Annotation[];
  travail?: Pick<Travail, 'kind' | 'instructions' | 'questions' | 'contenu'>;
}) {
  if (annotations.length === 0) return null;
  const aTraiter = annotations.filter((a) => !a.resolvedAt).length;
  const questions = travail?.questions ?? [];
  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2.5 space-y-2">
      <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5">
        <MessageSquareWarning className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        Retours de la relecture
        {aTraiter > 0 && <span className="text-amber-700 dark:text-amber-400 tabular-nums">· {aTraiter} à traiter</span>}
      </p>
      <ul className="space-y-1.5">
        {annotations.map((a) => (
          <AnnotationItem
            key={a.id}
            annotation={a}
            cible={cibleDe(a, questions)}
            action={<MarquerCorrigee annotationId={a.id} corrigee={Boolean(a.resolvedAt)} />}
          />
        ))}
      </ul>
      {travail && (
        <details className="rounded-lg bg-zinc-50/70 dark:bg-zinc-800/30 px-3 py-2">
          <summary className="text-[12px] text-zinc-600 dark:text-zinc-400 cursor-pointer">Voir le contenu annoté</summary>
          <div className="mt-2">
            <ContenuCours
              kind={travail.kind}
              instructions={travail.instructions}
              questions={travail.questions}
              contenu={travail.contenu}
              annotations={annotations}
            />
          </div>
        </details>
      )}
    </div>
  );
}
