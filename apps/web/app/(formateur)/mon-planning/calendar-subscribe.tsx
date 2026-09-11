'use client';

import { useState } from 'react';
import { CalendarPlus, Check, Copy } from 'lucide-react';

/** Abonnement à l'agenda : le planning s'affiche dans Google Agenda, Apple Calendrier ou Outlook. */
export function CalendarSubscribe({ url }: { url: string }) {
  const [copie, setCopie] = useState(false);
  const webcal = url.replace(/^https?:\/\//, 'webcal://');
  return (
    <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <CalendarPlus className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Retrouvez vos séances dans votre agenda</p>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
            Abonnez votre agenda à ce lien : vos séances s’y ajoutent et se mettent à jour toutes seules. Il est personnel, ne le partagez pas.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={webcal}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <CalendarPlus className="w-3.5 h-3.5" /> Ajouter à mon agenda
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopie(true);
            setTimeout(() => setCopie(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-900"
        >
          {copie ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copie ? 'Lien copié' : 'Copier le lien'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Google Agenda : « Autres agendas » → « + » → « À partir de l’URL », puis collez le lien.
      </p>
    </div>
  );
}
