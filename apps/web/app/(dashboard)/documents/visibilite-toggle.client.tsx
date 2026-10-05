'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Lock } from 'lucide-react';
import { changerVisibiliteDocument } from './visibilite-actions';

/** Interne ↔ visible dans l'espace entreprise, d'un clic. */
export function VisibiliteToggle({
  documentId,
  visible,
  modifiable = true,
}: {
  documentId: string;
  visible: boolean;
  modifiable?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={pending || !modifiable}
        onClick={() =>
          start(async () => {
            setErreur(null);
            const r = await changerVisibiliteDocument({ documentId, visible: !visible });
            if (r.ok) router.refresh();
            else setErreur(r.error);
          })
        }
        title={visible ? 'Visible dans l’espace entreprise — cliquer pour le rendre interne' : 'Interne — cliquer pour le rendre visible à l’entreprise'}
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium transition disabled:opacity-60 ${
          visible
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
        }`}
      >
        {visible ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        {visible ? 'Visible entreprise' : 'Interne'}
      </button>
      {erreur && <span className="text-[11px] text-red-600 dark:text-red-400 max-w-[14rem]">{erreur}</span>}
    </span>
  );
}
