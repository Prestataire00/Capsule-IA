'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Écran d'erreur des segments (`error.tsx`) : message clair, bouton pour
 * réessayer, et le code de l'incident à transmettre (il permet de retrouver
 * l'erreur exacte dans les journaux du serveur).
 */
export function PageError({ error, reset, homeHref = '/' }: { error: Error & { digest?: string }; reset: () => void; homeHref?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md text-center space-y-4">
        <AlertTriangle className="w-7 h-7 text-amber-500 dark:text-amber-400 mx-auto" aria-hidden />
        <h1 className="text-[20px] font-extrabold text-zinc-900 dark:text-zinc-100">Cette page n’a pas pu s’afficher</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Une erreur est survenue de notre côté. Réessayez dans un instant ; si elle persiste, transmettez ce code à l’organisme.
        </p>
        {error.digest && <p className="text-[12px] font-mono text-zinc-500">Code : {error.digest}</p>}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Réessayer
          </button>
          <a href={homeHref} className="text-[13px] text-zinc-600 dark:text-zinc-300 hover:underline">
            Retour à l’accueil
          </a>
        </div>
      </div>
    </div>
  );
}
