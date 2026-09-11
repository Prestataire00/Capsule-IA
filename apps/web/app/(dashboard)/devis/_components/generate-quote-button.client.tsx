'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, Loader2 } from 'lucide-react';
import { generateQuoteForDossier } from '../actions';
import { actionError } from './labels';

/** Établit le devis sans attendre la session ou l'analyse du besoin (cas particuliers). */
export function GenerateQuoteButton({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    start(async () => {
      const res = await generateQuoteForDossier({ dossierId });
      const e = actionError(res);
      if (e) {
        setError(e);
        return;
      }
      const quoteId = (res?.data as { quoteId?: string } | undefined)?.quoteId;
      if (quoteId) router.push(`/devis/${quoteId}`);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/70 dark:border-zinc-700 px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
        Établir le devis maintenant
      </button>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
