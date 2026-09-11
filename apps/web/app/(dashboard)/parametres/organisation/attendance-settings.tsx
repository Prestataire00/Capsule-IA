'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { setAttendanceAutoSend } from './attendance-settings-actions';

/** Réglage : envoi automatique des liens d'émargement avant chaque demi-journée. */
export function AttendanceSettings({ enabled, available }: { enabled: boolean; available: boolean }) {
  const [actif, setActif] = useState(enabled);
  const [pending, start] = useTransition();
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-3">
      <div>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Émargement</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Chaque apprenant reçoit par e-mail son lien personnel, de 30 minutes avant le début de chaque demi-journée à 10 minutes
          après, s’il n’a pas encore signé. Un seul envoi par personne et par demi-journée.
        </p>
      </div>
      {!available ? (
        <p className="text-[12px] text-amber-700 dark:text-amber-400">Réglage disponible une fois la migration 0145 appliquée.</p>
      ) : (
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={actif}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              setActif(v);
              setEtat(null);
              start(async () => {
                const r = await setAttendanceAutoSend(v);
                if (r.ok) setEtat({ ok: true, texte: v ? 'Envoi automatique activé' : 'Envoi automatique désactivé' });
                else {
                  setActif(!v);
                  setEtat({ ok: false, texte: r.error === 'forbidden' ? 'Réservé aux administrateurs.' : 'Le réglage n’a pas été enregistré.' });
                }
              });
            }}
            className="w-4 h-4 accent-violet-600"
          />
          <span className="text-[13px] text-zinc-800 dark:text-zinc-200">Envoyer automatiquement les liens d’émargement</span>
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
        </label>
      )}
      {etat && (
        <p role="status" className={`text-[12px] inline-flex items-center gap-1 ${etat.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {etat.ok && <Check className="w-3.5 h-3.5" />}
          {etat.texte}
        </p>
      )}
    </section>
  );
}
