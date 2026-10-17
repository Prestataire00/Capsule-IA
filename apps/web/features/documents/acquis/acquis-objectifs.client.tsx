'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';
import { LIBELLE_ACQUIS, NIVEAUX_ACQUIS, type NiveauAcquis } from '../acquis-objectifs';
import { enregistrerAcquis } from './acquis-actions';

const TON: Record<NiveauAcquis, string> = {
  acquis: 'bg-emerald-600 text-white border-emerald-600',
  en_cours: 'bg-amber-500 text-white border-amber-500',
  non_acquis: 'bg-red-600 text-white border-red-600',
};

/**
 * Les acquis, objectif par objectif, tels qu'ils figureront sur l'attestation
 * de fin de formation. Tout est « Acquis » par défaut : on ne touche qu'à
 * l'exception.
 */
export function AcquisObjectifs({
  dossierId,
  lignes,
  modifiable,
}: {
  dossierId: string;
  lignes: ReadonlyArray<{ objectif: string; niveau: NiveauAcquis }>;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(lignes.map((l) => [l.objectif, l.niveau])) as Record<string, NiveauAcquis>);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, start] = useTransition();

  const choisir = (objectif: string, niveau: NiveauAcquis) => {
    const avant = valeurs[objectif];
    setValeurs((v) => ({ ...v, [objectif]: niveau }));
    setErreur(null);
    start(async () => {
      const r = await enregistrerAcquis({ dossierId, objectif, niveau });
      if (!r.ok) {
        setValeurs((v) => ({ ...v, [objectif]: avant ?? 'acquis' }));
        setErreur(r.error);
      } else router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-8 h-8 rounded-lg grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
          <Target className="w-4 h-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Acquis par objectif</h3>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Repris sur l’attestation de fin de formation. Tout est « Acquis » par défaut : signalez seulement l’exception.
          </p>
        </div>
      </div>
      {lignes.length === 0 ? (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Le programme de la formation n’a pas d’objectifs renseignés.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {lignes.map((l) => (
            <li key={l.objectif} className="py-2 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[12rem] text-[13px] text-zinc-800 dark:text-zinc-200">{l.objectif}</span>
              <span className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden" role="radiogroup" aria-label={l.objectif}>
                {NIVEAUX_ACQUIS.map((n) => {
                  const actif = valeurs[l.objectif] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={actif}
                      disabled={!modifiable}
                      onClick={() => !actif && choisir(l.objectif, n)}
                      className={`px-2.5 h-7 text-[11px] font-medium border-l first:border-l-0 border-zinc-200 dark:border-zinc-700 transition disabled:cursor-default ${
                        actif ? TON[n] : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {n === 'en_cours' ? 'En cours' : LIBELLE_ACQUIS[n]}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">{erreur}</p>}
    </section>
  );
}
