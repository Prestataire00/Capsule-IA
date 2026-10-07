'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import { repondreAuReferent } from './actions';

type Message = { id: string; auteur: 'entreprise' | 'organisme'; auteurNom: string; body: string; createdAt: string };

const quand = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Les échanges avec le référent du client, et la réponse de l'équipe. */
export function EchangesReferent({ dossierId, messages, referent }: { dossierId: string; messages: readonly Message[]; referent: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      const p = messageEntrepriseSchema.safeParse({ body });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Message invalide.');
      const r = await repondreAuReferent(dossierId, p.data);
      if (!r.ok) return setErreur(r.error);
      setBody('');
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4" aria-label="Échanges avec le référent">
      <h3 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Échanges avec {referent}</h3>
      {messages.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun message pour l’instant. Le référent peut vous écrire depuis son espace.</p>
      ) : (
        <ul className="space-y-3 max-h-[420px] overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.auteur === 'organisme' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] ${
                  m.auteur === 'organisme'
                    ? 'bg-orange-50 text-zinc-900 dark:bg-orange-950/30 dark:text-zinc-100'
                    : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                }`}
              >
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1 tabular-nums">
                  {m.auteurNom} · {quand.format(new Date(m.createdAt))}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <label htmlFor="reponse-referent" className="sr-only">
          Votre réponse
        </label>
        <textarea
          id="reponse-referent"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={`Écrire à ${referent}…`}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Le message rejoint son espace ; un e-mail l’en prévient.
            {erreur && <span className="text-red-600 dark:text-red-400"> · {erreur}</span>}
          </span>
          <button
            type="button"
            onClick={envoyer}
            disabled={pending || body.trim() === ''}
            className="ml-auto h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
          </button>
        </div>
      </div>
    </section>
  );
}
