'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Send } from 'lucide-react';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import type { EchangeEspace } from '@/features/espace-entreprise/espace-complet';
import { envoyerMessageEntreprise } from '../echanges-actions';

const quand = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Écrire à l'organisme, et l'historique de ce qui a été échangé. */
export function VueEchanges({ token, organisme, echanges }: { token: string; organisme: string; echanges: readonly EchangeEspace[] }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();

  const envoyer = () =>
    start(async () => {
      setEtat(null);
      const p = messageEntrepriseSchema.safeParse({ body });
      if (!p.success) return setEtat({ ok: false, texte: p.error.issues[0]?.message ?? 'Message invalide.' });
      const r = await envoyerMessageEntreprise(token, p.data);
      if (!r.ok) return setEtat({ ok: false, texte: r.error });
      setBody('');
      setEtat({ ok: true, texte: `Message envoyé à ${organisme}. La réponse arrivera ici et par e-mail.` });
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3" aria-label="Écrire à l’organisme">
        <label htmlFor="message-organisme" className="block text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
          Écrire à {organisme}
        </label>
        <textarea
          id="message-organisme"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Une question sur une séance, un apprenant, une facture…"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {etat && <span className={`text-[12px] ${etat.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{etat.texte}</span>}
          <button
            type="button"
            onClick={envoyer}
            disabled={pending || body.trim() === ''}
            className="ml-auto h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
          </button>
        </div>
      </section>

      <section aria-label="Historique des échanges" className="space-y-2">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Historique</h2>
        {echanges.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun échange pour l’instant.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
            {echanges.map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-start gap-3">
                <span
                  className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                    e.sens === 'envoye' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                  }`}
                >
                  {e.sens === 'envoye' ? <Send className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{e.titre}</span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{quand.format(new Date(e.date))}</span>
                  </span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{e.sens === 'envoye' ? 'Vous' : e.auteur}</span>
                  {e.texte && <span className="block text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap mt-1">{e.texte}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
