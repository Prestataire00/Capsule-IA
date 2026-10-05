'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, Video } from 'lucide-react';

/**
 * Le lien de la visio d'une séance, à copier pour le donner à qui on veut,
 * ou à ouvrir. Sans lien, et si on peut le créer : un bouton pour le faire.
 */
export function LienVisio({
  url,
  creer,
  libelleRejoindre = 'Rejoindre la visio',
  principal = false,
}: {
  url: string | null;
  creer?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  libelleRejoindre?: string;
  /** Le formateur rejoint depuis son espace : là, c'est l'action de la page. */
  principal?: boolean;
}) {
  const router = useRouter();
  const [copie, setCopie] = useState<'ok' | 'echec' | null>(null);
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (!url) {
    if (!creer) return null;
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErreur(null);
              const r = await creer();
              if (r.ok) router.refresh();
              else setErreur(r.error);
            })
          }
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} Créer le lien visio
        </button>
        {erreur && <span className="text-[12px] text-red-600 dark:text-red-400 max-w-xs text-right">{erreur}</span>}
      </div>
    );
  }

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopie('ok');
    } catch {
      setCopie('echec');
    }
    setTimeout(() => setCopie(null), 2500);
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-0 shrink-0 max-w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            principal
              ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold shadow-sm shadow-orange-500/30 transition'
              : 'inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }
        >
          <Video className="w-4 h-4" /> {libelleRejoindre}
        </a>
        <button
          type="button"
          onClick={copier}
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg border transition ${
            copie === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          {copie === 'ok' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copie === 'ok' ? 'Lien copié' : 'Copier le lien'}
        </button>
      </div>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate select-all" title={url}>
        {copie === 'echec' ? 'Copie impossible : sélectionnez le lien ci-dessous.' : null}
        {copie === 'echec' && <br />}
        {url}
      </p>
    </div>
  );
}
