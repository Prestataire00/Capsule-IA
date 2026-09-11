'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { setSessionAutomation } from './actions';

/** Interrupteur d'un envoi automatique pour cette séance. */
export function AutomationToggle({
  sessionId,
  cle,
  actif,
  libelle,
}: {
  sessionId: string;
  cle: string;
  actif: boolean;
  libelle: string;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState(actif);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const basculer = () => {
    const cible = !etat;
    setEtat(cible);
    setErreur(null);
    start(async () => {
      const r = await setSessionAutomation({ sessionId, key: cle, enabled: cible });
      if (!r.ok) {
        setEtat(!cible);
        setErreur(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      {erreur && <span role="alert" className="text-[11px] text-red-600 dark:text-red-400 max-w-[14rem] text-right">{erreur}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={etat}
        aria-label={`${etat ? 'Désactiver' : 'Activer'} : ${libelle}`}
        disabled={pending}
        onClick={basculer}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
          etat ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition ${
            etat ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </span>
      </button>
    </div>
  );
}
