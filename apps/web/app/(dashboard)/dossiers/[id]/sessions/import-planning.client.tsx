'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, AlertTriangle, Check, Upload, X } from 'lucide-react';
import type { ImportSession } from '@/features/import/convention-types';
import type { SeanceRejetee } from '@/features/import/planning-seances';
import { creerSeancesDuPlanning, lirePlanning } from './import-planning-actions';

/**
 * Importer le planning d'un dossier depuis un document.
 *
 * Deux temps séparés : on lit et on MONTRE, on ne crée qu'après accord. Créer
 * directement ce que le modèle a compris reviendrait à faire signer des séances
 * que personne n'a vues. Ce qui a été écarté s'affiche aussi — une ligne
 * illisible passée sous silence, c'est une séance qui manquera au planning.
 */

const jourFr = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

export function ImportPlanning({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [lu, setLu] = useState<{
    seances: ImportSession[];
    rejetees: SeanceRejetee[];
    heures: number;
    debordent: ImportSession[];
  } | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const lire = (form: FormData) => {
    setErreur(null);
    setSucces(null);
    demarrer(async () => {
      const r = await lirePlanning(dossierId, form);
      if (!r.ok) {
        setErreur(r.error);
        setLu(null);
        return;
      }
      setLu({ seances: r.seances, rejetees: r.rejetees, heures: r.heures, debordent: r.debordent });
    });
  };

  const creer = () => {
    if (!lu) return;
    setErreur(null);
    demarrer(async () => {
      const r = await creerSeancesDuPlanning(dossierId, lu.seances);
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      setSucces(
        `${r.creees} séance${r.creees > 1 ? 's' : ''} créée${r.creees > 1 ? 's' : ''}${
          r.ignorees > 0 ? ` · ${r.ignorees} déjà présente${r.ignorees > 1 ? 's' : ''}` : ''
        }.`,
      );
      setLu(null);
      formRef.current?.reset();
      router.refresh();
    });
  };

  const debordantes = new Set(lu?.debordent.map((s) => `${s.date}|${s.startTime}`) ?? []);

  return (
    <details className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      <summary className="cursor-pointer select-none px-5 py-3.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <CalendarPlus className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
        Importer un planning
      </summary>

      <div className="px-5 pb-5 pt-1 space-y-4">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Déposez le calendrier reçu — PDF, photo ou capture. Les séances y sont relevées telles
          qu&apos;elles sont écrites, et vous les validez avant création. Rien n&apos;est déduit : une
          date ou un horaire manquant fait écarter la ligne plutôt que d&apos;inventer une séance.
        </p>

        <form
          ref={formRef}
          action={lire}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="file"
            name="document"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple
            required
            className="text-[12px] file:mr-2 file:h-8 file:px-3 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:text-[12px] file:font-medium"
          />
          <button
            type="submit"
            disabled={enCours}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold transition disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {enCours && !lu ? 'Lecture…' : 'Lire le document'}
          </button>
        </form>

        {erreur && (
          <p className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
            {erreur}
          </p>
        )}

        {succes && (
          <p className="text-[12px] text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-lg px-3 py-2 flex items-start gap-2">
            <Check className="w-3.5 h-3.5 mt-px shrink-0" />
            {succes}
          </p>
        )}

        {lu && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {lu.seances.length} séance{lu.seances.length > 1 ? 's' : ''} relevée
                {lu.seances.length > 1 ? 's' : ''}
              </h3>
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {lu.heures} h au total
              </span>
            </div>

            <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto">
              {lu.seances.map((s) => {
                const dehors = debordantes.has(`${s.date}|${s.startTime}`);
                return (
                  <li
                    key={`${s.date}-${s.startTime}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12px]"
                  >
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {jourFr.format(new Date(`${s.date}T12:00:00Z`))}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                      {s.startTime} – {s.endTime}
                    </span>
                    {s.label && <span className="text-zinc-500 dark:text-zinc-400 truncate">{s.label}</span>}
                    {s.location && <span className="text-zinc-400 truncate">{s.location}</span>}
                    {dehors && (
                      <span
                        title="Hors de la période du dossier"
                        className="ml-auto inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Hors période
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {lu.debordent.length > 0 && (
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                {lu.debordent.length} séance{lu.debordent.length > 1 ? 's tombent' : ' tombe'} hors des dates du
                dossier. Elles seront créées quand même — les dates du dossier suivront le planning.
              </p>
            )}

            {lu.rejetees.length > 0 && (
              <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                <summary className="cursor-pointer text-[12px] font-medium text-zinc-600 dark:text-zinc-300">
                  {lu.rejetees.length} ligne{lu.rejetees.length > 1 ? 's' : ''} écartée
                  {lu.rejetees.length > 1 ? 's' : ''}
                </summary>
                <ul className="mt-2 space-y-1">
                  {lu.rejetees.map((r, i) => (
                    <li key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5">
                      <X className="w-3 h-3 mt-px shrink-0 text-red-500" />
                      <span>
                        {r.seance.label || r.seance.date || 'ligne sans repère'} — {r.motif}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={creer}
                disabled={enCours}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {enCours ? 'Création…' : `Créer ${lu.seances.length} séance${lu.seances.length > 1 ? 's' : ''}`}
              </button>
              <button
                type="button"
                onClick={() => setLu(null)}
                className="h-9 px-3 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
