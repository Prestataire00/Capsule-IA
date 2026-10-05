'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { marquerAnnotationCorrigee } from './annotations-actions';

export function MarquerCorrigee({ annotationId, corrigee }: { annotationId: string; corrigee: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await marquerAnnotationCorrigee({ annotationId, corrigee: !corrigee });
            if (r.ok) router.refresh();
            else setErreur(r.error);
          })
        }
        className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
      >
        {corrigee ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
        {corrigee ? 'Rouvrir' : "C'est corrigé"}
      </button>
      {erreur && <span className="text-[11px] text-red-600">{erreur}</span>}
    </span>
  );
}
