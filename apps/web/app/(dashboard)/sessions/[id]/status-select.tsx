'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateSessionStatus } from './informations-actions';

const OPTIONS = [
  { value: 'planned', label: 'Planifiée', ton: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900' },
  { value: 'in_progress', label: 'En cours', ton: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  { value: 'done', label: 'Terminée', ton: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  { value: 'cancelled', label: 'Annulée', ton: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900' },
];

/** Statut de la séance, modifiable depuis l'en-tête (comme RFC). */
export function StatusSelect({ sessionId, status }: { sessionId: string; status: string }) {
  const router = useRouter();
  const [valeur, setValeur] = useState(status);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const option = OPTIONS.find((o) => o.value === valeur) ?? OPTIONS[0]!;

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Statut de la séance"
        value={valeur}
        disabled={pending}
        onChange={(e) => {
          const suivant = e.target.value;
          if (suivant === 'cancelled' && !window.confirm('Annuler cette séance ?')) return;
          const avant = valeur;
          setValeur(suivant);
          setErreur(null);
          start(async () => {
            const r = await updateSessionStatus({ sessionId, status: suivant });
            if (r.ok) router.refresh();
            else {
              setValeur(avant);
              setErreur(r.error);
            }
          });
        }}
        className={`text-[12px] font-medium pl-2.5 pr-7 py-1 rounded-full border ${option.ton} disabled:opacity-60`}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {erreur && <span role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</span>}
    </span>
  );
}
