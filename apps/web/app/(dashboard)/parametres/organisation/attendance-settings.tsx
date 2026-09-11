'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, ClipboardCheck } from 'lucide-react';
import { setAttendanceAutoSend, setAttendanceLunch } from './attendance-settings-actions';

const champ =
  'h-9 text-[13px] tabular-nums px-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition';

/** Réglages d'émargement : pause déjeuner et envoi automatique des liens. */
export function AttendanceSettings({
  enabled,
  available,
  lunchStart,
  lunchEnd,
}: {
  enabled: boolean;
  available: boolean;
  lunchStart: string;
  lunchEnd: string;
}) {
  const [actif, setActif] = useState(enabled);
  const [debut, setDebut] = useState(lunchStart);
  const [fin, setFin] = useState(lunchEnd);
  const [pending, start] = useTransition();
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);

  const message = (error: string) =>
    error === 'forbidden'
      ? 'Réservé aux administrateurs.'
      : error === 'pause_incoherente'
        ? 'La reprise doit suivre le début de la pause.'
        : 'Le réglage n’a pas été enregistré.';

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white bg-blue-500 shadow-md shadow-blue-500/30 shrink-0">
          <ClipboardCheck className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Émargement</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Une feuille par demi-journée, signée à l’entrée et à la sortie.</p>
        </div>
      </div>
      {!available ? (
        <p className="text-[12px] text-amber-700 dark:text-amber-400">Réglages disponibles une fois les migrations 0145 à 0147 appliquées.</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Pause déjeuner</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Elle sépare le matin de l’après-midi : sortir à son début ou revenir à la reprise n’est ni un départ anticipé ni un retard.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5">
                de
                <input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} className={champ} />
              </label>
              <label className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5">
                à
                <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className={champ} />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setEtat(null);
                    const r = await setAttendanceLunch(debut.slice(0, 5), fin.slice(0, 5));
                    setEtat(r.ok ? { ok: true, texte: 'Pause enregistrée — appliquée aux séances à venir' } : { ok: false, texte: message(r.error) });
                  })
                }
                className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-40"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div className="space-y-2">
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
                      setEtat({ ok: false, texte: message(r.error) });
                    }
                  });
                }}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Envoyer automatiquement les liens d’émargement</span>
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
            </label>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              De 30 minutes avant le début de chaque demi-journée à 10 minutes après, à chaque apprenant qui n’a pas encore signé — une
              seule fois par personne et par demi-journée. L’envoi est lancé par la base toutes les 10 minutes, dès que le secret des
              tâches programmées est enregistré dans le coffre Supabase.
            </p>
          </div>
        </>
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
