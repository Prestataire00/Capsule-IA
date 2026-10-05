'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { renvoyerTravail, type Ancrage } from './actions';

export function RenvoyerTravail({ ancrage, travailId }: { ancrage: Ancrage; travailId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErreur(null);
            const r = await renvoyerTravail({ ancrage, travailId });
            if (r.ok) router.refresh();
            else setErreur(r.error);
          })
        }
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-[12px] font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Renvoyer en validation
      </button>
      {erreur && <span className="text-[12px] text-red-600 dark:text-red-400">{erreur}</span>}
    </span>
  );
}
