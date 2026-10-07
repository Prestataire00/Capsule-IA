'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Send, Users } from 'lucide-react';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import type { EchangeEspace } from '@/features/espace-entreprise/espace-complet';
import type { MembreJoignable } from '@/features/espace-entreprise/messages-store';
import { envoyerMessageEntreprise } from '../echanges-actions';

const quand = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const heureSeule = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join('');

/** `general` : toute l'équipe ; un identifiant : un fil direct ; `emails` : ce que l'organisme a envoyé. */
export type FilEspace = 'general' | 'emails' | string;

/**
 * La messagerie du référent, en page entière : à gauche les fils (toute
 * l'équipe, chaque interlocuteur, les e-mails reçus), à droite le fil choisi.
 */
export function VueEchanges({
  token,
  organisme,
  echanges,
  equipe,
  fil: filDemande,
}: {
  token: string;
  organisme: string;
  echanges: readonly EchangeEspace[];
  equipe: readonly MembreJoignable[];
  fil: string | undefined;
}) {
  const fil: FilEspace = filDemande === 'emails' || equipe.some((m) => m.userId === filDemande) ? (filDemande as string) : 'general';
  const messages = echanges.filter((e) => e.interlocuteur !== undefined);
  const courriels = echanges.filter((e) => e.interlocuteur === undefined);
  const duFil = (cle: FilEspace) => messages.filter((m) => (cle === 'general' ? m.interlocuteur === null : m.interlocuteur === cle));
  const membre = equipe.find((m) => m.userId === fil) ?? null;

  const fils: Array<{ cle: FilEspace; titre: string; sousTitre: string; dernier: EchangeEspace | undefined }> = [
    { cle: 'general', titre: `Toute l’équipe ${organisme}`, sousTitre: 'Lu par toute l’équipe', dernier: duFil('general')[0] },
    ...equipe.map((m) => ({ cle: m.userId, titre: m.nom, sousTitre: m.fonction, dernier: duFil(m.userId)[0] })),
    { cle: 'emails', titre: 'E-mails reçus', sousTitre: `${courriels.length} e-mail${courriels.length > 1 ? 's' : ''}`, dernier: courriels[0] },
  ];

  return (
    <section
      aria-label="Messagerie"
      className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden grid md:grid-cols-[280px_1fr] min-h-[560px]"
    >
      <nav aria-label="Conversations" className="border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
        <p className="px-4 pt-4 pb-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Conversations</p>
        <ul className="pb-2">
          {fils.map((f) => {
            const actif = f.cle === fil;
            return (
              <li key={f.cle}>
                <Link
                  href={`/espace-entreprise/${token}?onglet=echanges&fil=${f.cle}`}
                  scroll={false}
                  aria-current={actif ? 'page' : undefined}
                  className={`mx-2 px-2.5 py-2 rounded-xl flex items-center gap-2.5 transition ${
                    actif ? 'bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-orange-200 dark:ring-orange-900/60' : 'hover:bg-white/70 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <Pastille cle={f.cle} titre={f.titre} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.titre}</span>
                      {f.dernier && <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">{quand.format(new Date(f.dernier.date))}</span>}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      {f.dernier ? (f.cle === 'emails' ? f.dernier.titre : `${f.dernier.sens === 'envoye' ? 'Vous : ' : ''}${f.dernier.texte ?? ''}`) : f.sousTitre}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {fil === 'emails' ? (
        <Courriels token={token} courriels={courriels} />
      ) : (
        <Fil
          key={fil}
          token={token}
          titre={membre ? membre.nom : `Toute l’équipe ${organisme}`}
          sousTitre={membre ? `${membre.fonction} · message personnel, lu par ${membre.nom.split(' ')[0]} uniquement` : `Lu par ${equipe.map((m) => m.nom.split(' ')[0]).join(', ') || 'toute l’équipe'}`}
          interlocuteur={membre?.userId ?? null}
          cle={fil}
          messages={[...duFil(fil)].reverse()}
        />
      )}
    </section>
  );
}

function Pastille({ cle, titre }: { cle: FilEspace; titre: string }) {
  if (cle === 'general')
    return (
      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
        <Users className="w-4 h-4" />
      </span>
    );
  if (cle === 'emails')
    return (
      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
        <Mail className="w-4 h-4" />
      </span>
    );
  return (
    <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[12px] font-medium">
      {initiales(titre)}
    </span>
  );
}

function Fil({
  token,
  titre,
  sousTitre,
  interlocuteur,
  cle,
  messages,
}: {
  token: string;
  titre: string;
  sousTitre: string;
  interlocuteur: string | null;
  cle: FilEspace;
  messages: readonly EchangeEspace[];
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      const p = messageEntrepriseSchema.safeParse({ body, interlocuteur });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Message invalide.');
      const r = await envoyerMessageEntreprise(token, p.data);
      if (!r.ok) return setErreur(r.error);
      setBody('');
      router.refresh();
    });

  let jourPrecedent = '';
  return (
    <div className="flex flex-col min-h-0">
      <header className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
        <Pastille cle={cle} titre={titre} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{titre}</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{sousTitre}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 max-h-[520px]" aria-live="polite">
        {messages.length === 0 ? (
          <p className="h-full min-h-[200px] grid place-items-center text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun message pour l’instant.
            <br />
            Écrivez ci-dessous : la réponse arrivera ici et par e-mail.
          </p>
        ) : (
          messages.map((m) => {
            const leJour = jour.format(new Date(m.date));
            const separateur = leJour !== jourPrecedent;
            jourPrecedent = leJour;
            const moi = m.sens === 'envoye';
            return (
              <div key={m.id}>
                {separateur && <p className="text-center text-[11px] text-zinc-400 my-3 first-letter:uppercase">{leJour}</p>}
                <div className={`flex ${moi ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${
                      moi ? 'bg-orange-500 text-white rounded-br-md' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                    }`}
                  >
                    {!moi && <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">{m.auteur}</p>}
                    <p className="text-[13px] whitespace-pre-wrap break-words">{m.texte}</p>
                    <p className={`text-[11px] tabular-nums text-right ${moi ? 'text-orange-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {heureSeule.format(new Date(m.date))}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bas} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
        className="border-t border-zinc-100 dark:border-zinc-800 p-3 space-y-1.5"
      >
        <div className="flex items-end gap-2">
          <label htmlFor="message-fil" className="sr-only">
            Écrire à {titre}
          </label>
          <textarea
            id="message-fil"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (body.trim()) envoyer();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={`Écrire à ${titre}…`}
            className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
          <button
            type="submit"
            disabled={pending || body.trim() === ''}
            className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
          </button>
        </div>
        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      </form>
    </div>
  );
}

function Courriels({ token, courriels }: { token: string; courriels: readonly EchangeEspace[] }) {
  return (
    <div className="flex flex-col min-h-0">
      <header className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
        <Pastille cle="emails" titre="E-mails reçus" />
        <div>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">E-mails reçus</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Ce que l’organisme vous a envoyé par e-mail</p>
        </div>
      </header>
      {courriels.length === 0 ? (
        <p className="p-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">Aucun e-mail pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-y-auto max-h-[520px]">
          {courriels.map((c) => (
            <li key={c.id}>
              <Link href={`/espace-entreprise/${token}/echange/${c.id.slice(5)}`} className="px-5 py-3 flex items-baseline justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-400 truncate">{c.titre}</span>
                <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{quand.format(new Date(c.date))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
