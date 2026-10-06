'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Merge, UsersRound } from 'lucide-react';
import type { GroupeDoublons } from '@/features/trainers/doublons';
import { fusionnerFormateurs } from './fusion-actions';

const nom = (f: { firstName: string | null; lastName: string | null }) => `${f.firstName ?? ''} ${f.lastName ?? ''}`.trim() || 'Sans nom';

/**
 * Les fiches qui désignent sans doute la même personne, et le geste pour les
 * réunir : on choisit celle qu'on garde, l'autre lui est rattachée puis part
 * à la corbeille. Confirmation dans la page — une fusion ne se défait pas.
 */
export function DoublonsFormateurs({ groupes }: { groupes: readonly GroupeDoublons[] }) {
  const router = useRouter();
  const [aConfirmer, setAConfirmer] = useState<{ garde: string; doublon: string; libelle: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();

  const fusionner = () => {
    if (!aConfirmer) return;
    start(async () => {
      const r = await fusionnerFormateurs({ gardeId: aConfirmer.garde, doublonId: aConfirmer.doublon });
      setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.error });
      setAConfirmer(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <section className="mb-6 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3" aria-labelledby="doublons-formateurs">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <UsersRound className="w-4 h-4" />
        </span>
        <h2 id="doublons-formateurs" className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          Doublons possibles · <span className="tabular-nums">{groupes.length}</span>
        </h2>
      </div>
      <ul className="space-y-2.5">
        {groupes.map((g) => (
          <li key={g.fiches.map((f) => f.id).join('|')} className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-3 space-y-2">
            <p className="text-[12px] font-medium text-amber-700 dark:text-amber-300">{g.raison}</p>
            {g.fiches.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">{nom(f)}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                    {f.email ?? 'sans e-mail'} · {f.aUnCompte ? 'a un compte' : 'sans compte'}
                  </span>
                </span>
                {g.fiches.length === 2 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const autre = g.fiches.find((x) => x.id !== f.id)!;
                      setMessage(null);
                      setAConfirmer({ garde: f.id, doublon: autre.id, libelle: `Garder « ${nom(f)} » (${f.email ?? 'sans e-mail'}) et y rattacher « ${nom(autre)} » (${autre.email ?? 'sans e-mail'}) ?` });
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <Merge className="w-3.5 h-3.5" /> Garder celle-ci
                  </button>
                )}
              </div>
            ))}
            {g.fiches.length > 2 && <p className="text-[12px] text-zinc-500">Plus de deux fiches : réunissez-les deux par deux depuis leur fiche.</p>}
          </li>
        ))}
      </ul>
      {aConfirmer && (
        <div role="alertdialog" aria-label="Confirmer la fusion" className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 space-y-2">
          <p className="text-[13px] text-zinc-800 dark:text-zinc-200">{aConfirmer.libelle}</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Séances, dossiers, signatures, supports et factures passent sur la fiche gardée ; l’autre part à la corbeille. Cela ne se défait pas.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={fusionner} disabled={pending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium disabled:opacity-50">
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Réunir les deux fiches
            </button>
            <button type="button" onClick={() => setAConfirmer(null)} className="h-8 px-3 rounded-lg text-[12px] text-zinc-600 dark:text-zinc-300">
              Annuler
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className={`text-[12px] ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.texte}</p>}
    </section>
  );
}
