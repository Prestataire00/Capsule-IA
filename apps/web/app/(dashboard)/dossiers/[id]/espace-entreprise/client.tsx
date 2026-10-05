'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Link2, Loader2, Mail, Unplug } from 'lucide-react';
import { couperLiensEntreprise, envoyerLienEntreprise, genererLienEntreprise } from './actions';

export function EspaceEntrepriseClient({ dossierId, aUnEmail }: { dossierId: string; aUnEmail: boolean }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const agir = (fn: () => Promise<{ ok: true; url?: string } | { ok: false; error: string }>, succes: string) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ ok: false, texte: r.error });
      if (r.url) setUrl(r.url);
      setMessage({ ok: true, texte: succes });
    });

  const copier = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setMessage({ ok: false, texte: 'Copie impossible : sélectionnez le lien ci-dessous.' });
    }
  };

  const bouton =
    'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50';

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !aUnEmail}
          onClick={() => agir(() => envoyerLienEntreprise(dossierId), 'Lien envoyé au référent.')}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium shadow-sm disabled:opacity-50"
          title={aUnEmail ? undefined : 'Le référent n’a pas d’adresse e-mail'}
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Envoyer son lien au référent
        </button>
        <button type="button" disabled={pending} onClick={() => agir(() => genererLienEntreprise(dossierId), 'Lien prêt.')} className={bouton}>
          <Link2 className="w-3.5 h-3.5" /> Obtenir le lien
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm('Couper tous les liens déjà envoyés à ce référent ? Il faudra lui en renvoyer un.')) {
              agir(() => couperLiensEntreprise(dossierId), 'Les anciens liens ne fonctionnent plus.');
            }
          }}
          className={`${bouton} hover:text-red-600`}
        >
          <Unplug className="w-3.5 h-3.5" /> Couper les liens envoyés
        </button>
      </div>

      {url && (
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-[12px] text-zinc-600 dark:text-zinc-400 truncate select-all rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2" title={url}>
            {url}
          </p>
          <button type="button" onClick={copier} className={bouton}>
            {copie ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}

      {message && (
        <p className={`text-[12px] ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.texte}
        </p>
      )}
    </div>
  );
}
