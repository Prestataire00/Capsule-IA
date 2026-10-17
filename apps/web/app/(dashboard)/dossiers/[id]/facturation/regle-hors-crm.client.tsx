'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { marquerRegleHorsCrm } from './regle-hors-crm-actions';

/** « Réglé hors Capsule » : pour les dossiers facturés et encaissés dans Qonto. */
export function RegleHorsCrm({ dossierId, regleLe, note }: { dossierId: string; regleLe: string | null; note: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = () => {
    const regle = !regleLe;
    const saisie = regle ? window.prompt('Dossier facturé et encaissé hors Capsule (ex. Qonto). Référence de la facture, si vous l’avez :', '') : null;
    if (regle && saisie === null) return;
    start(async () => {
      setErreur(null);
      const r = await marquerRegleHorsCrm({ dossierId, regle, note: saisie ?? undefined });
      if (r.ok) router.refresh();
      else setErreur(r.error);
    });
  };

  return (
    <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${regleLe ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-zinc-200/70 dark:border-zinc-800'}`}>
      <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${regleLe ? 'text-emerald-600' : 'text-zinc-400'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          {regleLe
            ? `Réglé hors Capsule le ${new Date(regleLe).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}${note ? ` — ${note}` : ''}`
            : 'Facturé et encaissé ailleurs (Qonto) ?'}
        </p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          {regleLe
            ? 'Le dossier n’apparaît plus comme impayé et n’invite plus à facturer.'
            : 'Marquez-le réglé : il ne sera plus signalé impayé, sans émettre de facture en double au client.'}
        </p>
        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{erreur}</p>}
      </div>
      <button
        type="button"
        onClick={basculer}
        disabled={pending}
        className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm disabled:opacity-50"
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {regleLe ? 'Annuler' : 'Marquer réglé'}
      </button>
    </div>
  );
}
