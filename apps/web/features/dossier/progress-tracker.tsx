import Link from 'next/link';
import { Check } from 'lucide-react';
import type { DossierProgress } from './load-progress';

const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

/** Frise d'avancement du dossier — étapes déduites des données, jamais cochées à la main. */
export function DossierProgressTracker({ progress }: { progress: DossierProgress }) {
  const total = progress.steps.length;
  const pct = Math.round((progress.doneCount / total) * 100);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Avancement du dossier
          </h2>
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {progress.doneCount} / {total} étapes
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {progress.current && (
          <p className="mt-2 text-[12px] text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Prochaine étape :</span>{' '}
            {progress.current.label}
            {progress.current.hint ? ` — ${progress.current.hint}` : ''}
          </p>
        )}
      </div>

      <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {progress.steps.map((step, i) => {
          const isCurrent = progress.current?.key === step.key;
          const content = (
            <div className="flex items-center gap-3 px-5 py-2.5">
              <span
                className={
                  step.done
                    ? 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white'
                    : isCurrent
                      ? 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-orange-400 text-[10px] font-semibold text-orange-600 dark:text-orange-400'
                      : 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 text-[10px] text-zinc-400'
                }
              >
                {step.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={
                  step.done
                    ? 'text-[13px] text-zinc-900 dark:text-zinc-100'
                    : isCurrent
                      ? 'text-[13px] font-medium text-zinc-900 dark:text-zinc-100'
                      : 'text-[13px] text-zinc-400 dark:text-zinc-500'
                }
              >
                {step.label}
              </span>
              <span className="ml-auto text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                {step.done ? shortDate(step.at) : ''}
              </span>
            </div>
          );

          return (
            <li key={step.key}>
              {step.href && !step.done ? (
                <Link href={step.href} className="block hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
