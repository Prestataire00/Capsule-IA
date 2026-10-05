'use client';

import { useState, useTransition } from 'react';
import { Loader2, Star } from 'lucide-react';
import { identifierPourSatisfaction } from './actions';

export function IdentificationSatisfaction({ sessionId, pass, titre }: { sessionId: string; pass: string; titre: string }) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const champ =
    'w-full h-11 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[15px] text-zinc-900 dark:text-zinc-100';

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <form
        className="w-full max-w-[400px] space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setErreur(null);
            const r = await identifierPourSatisfaction({ sessionId, pass, prenom, nom });
            if (r.ok) window.location.assign(r.url);
            else setErreur(r.error);
          });
        }}
      >
        <div className="text-center space-y-1">
          <span className="mx-auto w-12 h-12 rounded-xl grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <Star className="w-6 h-6" />
          </span>
          <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-zinc-100">Votre avis sur la formation</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{titre} — deux minutes, pour améliorer les prochaines.</p>
        </div>
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" autoComplete="given-name" className={champ} />
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" autoComplete="family-name" className={champ} />
        {erreur && <p className="text-[13px] text-red-600 dark:text-red-400">{erreur}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} Répondre
        </button>
      </form>
    </div>
  );
}
