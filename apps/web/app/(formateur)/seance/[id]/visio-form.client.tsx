'use client';

import { useState, useTransition } from 'react';
import { Loader2, Video, Check } from 'lucide-react';
import { setSessionRemoteUrl } from './actions';

/**
 * Le lien de visio appartient au formateur : c'est lui qui ouvre la salle
 * (Meet, Zoom, Teams). Il le colle ici, et l'apprenant le retrouve dans son
 * espace et dans sa convocation.
 */
export function VisioForm({ sessionId, initialUrl }: { sessionId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [message, setMessage] = useState<{ ton: 'ok' | 'ko'; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const enregistrer = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await setSessionRemoteUrl({ sessionId, url: url.trim() });
      setMessage(
        res.ok
          ? { ton: 'ok', texte: url.trim() ? 'Lien enregistré.' : 'Lien retiré.' }
          : { ton: 'ko', texte: res.error },
      );
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <Video className="w-4 h-4" />
        </span>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Lien de visioconférence</h2>
      </div>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Collez votre lien Meet, Zoom ou Teams : il apparaît aussitôt dans l&apos;espace des participants.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://meet.google.com/…"
          className="flex-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending}
          className="h-9 px-4 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[13px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
      </div>
      {url.trim() && (
        <a
          href={url.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1"
        >
          <Video className="w-3.5 h-3.5" /> Ouvrir la salle
        </a>
      )}
      {message && (
        <p className={`text-[12px] ${message.ton === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.texte}
        </p>
      )}
    </section>
  );
}
