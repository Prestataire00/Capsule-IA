'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, AlertTriangle, Hand } from 'lucide-react';
import { validerEtape, retirerValidationEtape } from './avancement-actions';

/**
 * Valider une étape à la main, quand la preuve vit hors de l'application.
 *
 * Le motif est demandé, pas imposé : c'est ce qu'on relira devant un auditeur,
 * mais exiger une phrase pour cocher une case ferait renoncer.
 */
export function ValiderEtape({
  dossierId,
  stepKey,
  label,
  valideeALaMain,
}: {
  dossierId: string;
  stepKey: string;
  label: string;
  valideeALaMain: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const agir = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setErreur(null);
    demarrer(async () => {
      const r = await action();
      if (!r.ok) setErreur(r.error);
      else {
        setOuvert(false);
        setNote('');
        router.refresh();
      }
    });
  };

  if (valideeALaMain) {
    return (
      <button
        type="button"
        disabled={enCours}
        onClick={() => agir(() => retirerValidationEtape({ dossierId, stepKey }))}
        title="Retirer la validation manuelle"
        className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition disabled:opacity-50"
      >
        <X className="w-3 h-3" />
        Retirer
      </button>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
      >
        <Hand className="w-3 h-3" />
        Valider
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder={`${label} — comment le savez-vous ?`}
        className="h-7 w-56 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11px]"
      />
      <button
        type="button"
        disabled={enCours}
        onClick={() => agir(() => validerEtape({ dossierId, stepKey, note }))}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold transition disabled:opacity-50"
      >
        <Check className="w-3 h-3" />
        Valider
      </button>
      <button
        type="button"
        onClick={() => {
          setOuvert(false);
          setErreur(null);
        }}
        className="h-7 px-1.5 rounded-md text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      >
        Annuler
      </button>
      {erreur && (
        <span className="inline-flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400 basis-full">
          <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
          {erreur}
        </span>
      )}
    </span>
  );
}
