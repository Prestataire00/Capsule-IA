'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlayCircle, Plus, Trash2 } from 'lucide-react';
import { LIBELLE_SOURCE } from '../replays';
import type { Replay } from '../replays-store';

type Resultat = { ok: true } | { ok: false; error: string };

/**
 * Les replays d'une séance : le lien tl;dv, Lexi, Meet ou Zoom de
 * l'enregistrement, collé ici et retrouvé par l'entreprise dans son espace.
 */
export function ReplaysSeance({
  sessionId,
  replays,
  ajouter,
  retirer,
  peutModifier,
}: {
  sessionId: string;
  replays: readonly Replay[];
  ajouter: (input: { sessionId: string; url: string; titre?: string }) => Promise<Resultat>;
  retirer: (sessionId: string, replayId: string) => Promise<Resultat>;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [titre, setTitre] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      const r = await ajouter({ sessionId, url, titre: titre || undefined });
      if (!r.ok) return setErreur(r.error);
      setUrl('');
      setTitre('');
      router.refresh();
    });

  const supprimer = (id: string) =>
    start(async () => {
      setErreur(null);
      const r = await retirer(sessionId, id);
      if (!r.ok) return setErreur(r.error);
      router.refresh();
    });

  const champ =
    'h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-[13px] min-w-0 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 space-y-3" aria-labelledby={`replays-${sessionId}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <PlayCircle className="w-4 h-4" />
        </span>
        <h2 id={`replays-${sessionId}`} className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          Replays
        </h2>
      </div>
      {replays.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Aucun replay. Collez le lien de partage tl;dv ou Lexi de l’enregistrement : l’entreprise le retrouve dans son espace.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {replays.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-[13px] text-blue-700 dark:text-blue-300 hover:underline truncate">
                {r.titre || 'Replay'} <span className="text-zinc-500 dark:text-zinc-400">· {LIBELLE_SOURCE[r.source]}</span>
              </a>
              {peutModifier && (
                <button
                  type="button"
                  onClick={() => supprimer(r.id)}
                  disabled={pending}
                  aria-label={`Retirer ${r.titre || 'ce replay'}`}
                  className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {peutModifier && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`replay-url-${sessionId}`} className="sr-only">
            Lien du replay
          </label>
          <input id={`replay-url-${sessionId}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tldv.io/app/meetings/…" className={`${champ} flex-1 basis-64`} />
          <label htmlFor={`replay-titre-${sessionId}`} className="sr-only">
            Libellé
          </label>
          <input id={`replay-titre-${sessionId}`} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Libellé (facultatif)" className={`${champ} basis-40`} />
          <button
            type="button"
            onClick={envoyer}
            disabled={pending || url.trim() === ''}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Ajouter
          </button>
        </div>
      )}
      {erreur && (
        <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">
          {erreur}
        </p>
      )}
    </section>
  );
}
