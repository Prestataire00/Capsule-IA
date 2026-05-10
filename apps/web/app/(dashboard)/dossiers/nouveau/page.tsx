// ARCHETYPE: workflow
// Justification: création multi-étapes guidée — focus extrême, 1 seule chose par écran, pas de sidebar.

import Link from 'next/link';
import { X, Check } from 'lucide-react';
import { Step1Context } from './_components/step-1-context';
import { Step2Modules } from './_components/step-2-modules';
import { Step3Finance } from './_components/step-3-finance';

const STEPS = [
  { num: 1, slug: '1', label: 'Contexte' },
  { num: 2, slug: '2', label: 'Modules & formateur' },
  { num: 3, slug: '3', label: 'Finance & validation' },
] as const;

export default function NewDossierPage({
  searchParams,
}: {
  searchParams: { step?: '1' | '2' | '3' };
}) {
  const current = searchParams.step ?? '1';

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-white dark:bg-zinc-950 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link
          href="/dossiers"
          className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition"
        >
          <X className="w-3 h-3" />
          Quitter
        </Link>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Brouillon enregistré il y a 2 s
        </span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start pt-12 px-6 pb-12">
        <Stepper current={current} />

        <div className="w-full max-w-[480px] mt-12">
          {current === '1' && <Step1Context />}
          {current === '2' && <Step2Modules />}
          {current === '3' && <Step3Finance />}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: string }) {
  return (
    <div className="w-full max-w-[580px] flex items-center">
      {STEPS.map((s, i) => {
        const isActive = s.slug === current;
        const isDone = Number(current) > s.num;
        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={
                  isDone
                    ? 'w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[13px] font-medium'
                    : isActive
                    ? 'w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[13px] font-medium'
                    : 'w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 flex items-center justify-center text-[13px]'
                }
              >
                {isDone ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span
                className={
                  isActive
                    ? 'text-[11px] text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'text-[11px] text-zinc-500 dark:text-zinc-400'
                }
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={
                  isDone
                    ? 'flex-1 h-px bg-emerald-300 dark:bg-emerald-800 mx-2 mb-6'
                    : 'flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 mb-6'
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
