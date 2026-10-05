'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Lock } from 'lucide-react';
import { changerVisibiliteDocument } from './visibilite-actions';

/**
 * Qui voit le document : l'équipe seulement (« Interne »), ou aussi le
 * référent du client dans son espace entreprise (« Commun à tous »).
 */
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

  const choisir = (v: boolean) => {
    if (v === visible || pending) return;
    start(async () => {
      setErreur(null);
      const r = await changerVisibiliteDocument({ documentId, visible: v });
      if (r.ok) router.refresh();
      else setErreur(r.error);
    });
  };

  const options = [
    { valeur: false, label: 'Interne', icone: Lock, ton: 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900' },
    { valeur: true, label: 'Commun à tous', icone: Building2, ton: 'bg-emerald-600 text-white' },
  ];

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        role="radiogroup"
        aria-label="Visibilité du document"
        className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-700 p-0.5 bg-white dark:bg-zinc-900"
      >
        {options.map((o) => {
          const actif = o.valeur === visible;
          const Icone = o.icone;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={actif}
              disabled={!modifiable || pending}
              onClick={() => choisir(o.valeur)}
              title={o.valeur ? 'Visible aussi dans l’espace entreprise du référent' : 'Réservé à l’équipe'}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium transition disabled:cursor-not-allowed ${
                actif ? o.ton : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {pending && !actif ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icone className="w-3 h-3" />}
              {o.label}
            </button>
          );
        })}
      </span>
      {erreur && <span className="text-[11px] text-red-600 dark:text-red-400 max-w-[16rem]">{erreur}</span>}
    </span>
  );
}
