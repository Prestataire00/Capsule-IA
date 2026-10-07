import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, AtSign, Building2, MessagesSquare, Search } from 'lucide-react';
import type { Fil, MessageEquipe } from '../store';
import type { LibelleDossier, MembreDiscussion } from '../equipe';
import type { InfosFil } from '../infos-fil';
import { FilMessages } from './fil-messages';
import { ComposerEquipe } from './composer.client';
import { ComposerDirect } from './composer-direct.client';
import { NouvelleConversation } from './nouvelle.client';
import { titreConversation, type Interlocuteur } from '../directs';
import type { ConversationDirecte } from '../directs-store';
import type { FilClient, MembreJoignable } from '@/features/espace-entreprise/messages-store';

const dateCourte = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

// Les petits mots (« à », « de », « l’IA ») ne font pas d'initiales : « Acculturation à l’IA » donne « AI ».
export const initiales = (nom: string): string =>
  nom
    .replace(/\b[ldLD]['’]/g, '')
    .split(/[\s—-]+/)
    .filter((m) => m.length > 1 && !/^(à|au|aux|de|des|du|en|et|la|le|les|un|une|pour|sur)$/i.test(m))
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('') || '?';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Ouvert = {
  dossier: LibelleDossier;
  messages: readonly MessageEquipe[];
  equipe: readonly MembreDiscussion[];
  infos: InfosFil | null;
  /** Page du dossier ; absente pour qui n'y a pas accès. */
  lien: string | null;
  /** Le même dossier côté client : les échanges de l'espace entreprise de son référent. */
  client?: { contactId: string; nom: string; messages: readonly MessageEquipe[] } | null;
};

type DirectOuvert = { conversation: ConversationDirecte; messages: readonly MessageEquipe[] };

/** Le fil d'un client : les messages de son espace entreprise. */
type ClientOuvert = {
  contactId: string;
  interlocuteurUserId: string | null;
  nom: string;
  entreprise: string | null;
  messages: readonly MessageEquipe[];
  dossier: LibelleDossier | null;
  infos: InfosFil | null;
  /** Le référent et l'équipe qui lit ce fil. */
  lecteurs: readonly MembreJoignable[];
};

const lienClient = (chemin: string, c: { contactId: string; interlocuteurUserId: string | null }) =>
  `${chemin}?client=${c.contactId}${c.interlocuteurUserId ? `&avec=${c.interlocuteurUserId}` : ''}`;

type Envoi<T> = (input: T) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * La messagerie d'équipe en trois volets : les fils, regroupés par client, à
 * gauche ; la discussion au centre ; les infos rapides et l'équipe à droite.
 * Même écran pour l'organisme et pour le formateur ; seuls changent le chemin,
 * l'action d'envoi et les fils proposés.
 */
export function Messagerie({
  chemin,
  fils,
  aOuvrir,
  ouvert,
  envoyer,
  meId,
  recherche = '',
  pourMoi = false,
  vue: vueDemandee,
  directs,
  joignables,
  direct,
  envoyerDirect,
  ouvrirDirect,
  clients = [],
  dossiersClients = new Map(),
  client = null,
  repondreClient,
}: {
  chemin: string;
  fils: readonly Fil[];
  /** Dossiers sans fil encore, pour en démarrer un. */
  aOuvrir: readonly LibelleDossier[];
  ouvert: Ouvert | null;
  envoyer: (input: { dossierId: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  meId: string;
  recherche?: string;
  pourMoi?: boolean;
  /** Tout le fil, mes mentions, ou l'échange avec le client du dossier. */
  vue?: 'tout' | 'moi' | 'client';
  /** Conversations directes, hors dossier. */
  directs: readonly ConversationDirecte[];
  /** Les personnes à qui l'on peut écrire. */
  joignables: readonly Interlocuteur[];
  direct: DirectOuvert | null;
  envoyerDirect: Envoi<{ conversationId: string; body: string }>;
  ouvrirDirect: (input: { avec: string[] }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** Les clients qui ont écrit depuis leur espace entreprise (équipe seulement). */
  clients?: readonly FilClient[];
  /** Le dossier rappelé sous chaque fil client. */
  dossiersClients?: ReadonlyMap<string, LibelleDossier>;
  client?: ClientOuvert | null;
  repondreClient?: Envoi<{ conversationId: string; body: string }>;
}) {
  const q = normaliser(recherche.trim());
  const visibles = q
    ? fils.filter((f) =>
        normaliser([f.dossier.titre, f.dossier.reference, f.dossier.formation ?? '', f.dernierMessage?.body ?? ''].join(' ')).includes(q),
      )
    : fils;

  // Les dossiers d'un même client ensemble.
  const groupes = new Map<string, Fil[]>();
  for (const f of visibles) groupes.set(f.dossier.titre, [...(groupes.get(f.dossier.titre) ?? []), f]);
  const lienFil = (id: string, extra = '') => `${chemin}?dossier=${id}${q ? `&q=${encodeURIComponent(recherche)}` : ''}${extra}`;
  const directsVisibles = q
    ? directs.filter((c) =>
        normaliser([titreConversation(c.autres), c.dernierMessage?.body ?? ''].join(' ')).includes(q),
      )
    : directs;
  const lienDirect = (id: string) => `${chemin}?direct=${id}${q ? `&q=${encodeURIComponent(recherche)}` : ''}`;
  const clientsVisibles = q
    ? clients.filter((c) => normaliser([c.nom, c.entreprise ?? '', c.dernier.body].join(' ')).includes(q))
    : clients;
  const unOuvert = Boolean(ouvert || direct || client);
  const vue = vueDemandee ?? (pourMoi ? 'moi' : 'tout');
  const duClient = ouvert?.client ?? null;
  const ongletClient = vue === 'client' && duClient !== null;
  const messages = !ouvert
    ? []
    : vue === 'moi'
      ? ouvert.messages.filter((m) => m.mentions.includes(meId) || m.authorUserId === meId)
      : ongletClient
        ? duClient.messages
        : [...ouvert.messages, ...(duClient?.messages ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Le fil général d'un client rattaché à un dossier s'ouvre dans la discussion de ce dossier.
  const lienClientDe = (c: FilClient) =>
    !c.interlocuteurUserId && c.dossierId ? `${chemin}?dossier=${c.dossierId}&vue=client` : lienClient(chemin, c);

  return (
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px] rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden lg:h-[calc(100vh-12rem)] lg:min-h-[560px]">
      {/* ── Les fils ─────────────────────────────────────────────── */}
      <aside className={`${unOuvert ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 border-r border-zinc-200/70 dark:border-zinc-800`}>
        <div className="relative p-4 space-y-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Conversations</h2>
            <NouvelleConversation chemin={chemin} joignables={joignables} dossiers={aOuvrir} ouvrir={ouvrirDirect} />
          </div>
          <form action={chemin} role="search" className="relative">
            {ouvert && <input type="hidden" name="dossier" value={ouvert.dossier.id} />}
            {direct && <input type="hidden" name="direct" value={direct.conversation.id} />}
            {client && <input type="hidden" name="client" value={client.contactId} />}
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <label htmlFor="recherche-fils" className="sr-only">
              Rechercher une conversation
            </label>
            <input
              id="recherche-fils"
              name="q"
              defaultValue={recherche}
              placeholder="Personne, client, dossier, message…"
              className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </form>
        </div>

        <nav aria-label="Conversations" className="flex-1 min-h-0 overflow-y-auto p-2">
          {clientsVisibles.length > 0 && (
            <div className="mb-2">
              <p className="flex items-center justify-between px-2.5 pt-2 pb-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Clients</span>
                <span className="tabular-nums">{clientsVisibles.length}</span>
              </p>
              <ul className="space-y-0.5">
                {clientsVisibles.map((c) => {
                  const actif =
                    (client?.contactId === c.contactId && client.interlocuteurUserId === c.interlocuteurUserId) ||
                    (!c.interlocuteurUserId && c.dossierId !== null && ouvert?.dossier.id === c.dossierId && ongletClient);
                  return (
                    <li key={`${c.contactId}-${c.interlocuteurUserId ?? 'tous'}`}>
                      <Link
                        href={lienClientDe(c)}
                        aria-current={actif ? 'page' : undefined}
                        className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${
                          actif ? 'bg-orange-50 dark:bg-orange-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          <Building2 className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.entreprise ?? c.nom}</span>
                            {c.interlocuteurUserId && (
                              <span className="shrink-0 h-4 px-1.5 rounded-full text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">pour vous</span>
                            )}
                            <span className="ml-auto text-[11px] text-zinc-400 tabular-nums shrink-0">{dateCourte.format(new Date(c.dernier.createdAt))}</span>
                          </span>
                          {c.dossierId && dossiersClients.get(c.dossierId) && (
                            <span className="block text-[12px] text-blue-700 dark:text-blue-300 truncate">
                              {dossiersClients.get(c.dossierId)?.formation ?? 'Dossier'} ·{' '}
                              <span className="font-mono text-[11px]">{dossiersClients.get(c.dossierId)?.reference}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                              {c.dernier.auteurNom} : {c.dernier.body}
                            </span>
                            {c.nonLus > 0 && (
                              <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full text-[11px] font-medium bg-orange-500 text-white grid place-items-center tabular-nums shrink-0">
                                {c.nonLus}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {directsVisibles.length > 0 && (
            <div className="mb-2">
              <p className="flex items-center justify-between px-2.5 pt-2 pb-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Messages directs</span>
                <span className="tabular-nums">{directsVisibles.length}</span>
              </p>
              <ul className="space-y-0.5">
                {directsVisibles.map((c) => {
                  const actif = direct?.conversation.id === c.id;
                  const titre = titreConversation(c.autres);
                  return (
                    <li key={c.id}>
                      <Link
                        href={lienDirect(c.id)}
                        aria-current={actif ? 'page' : undefined}
                        className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${
                          actif ? 'bg-orange-50 dark:bg-orange-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {c.autres.length > 1 ? `${c.autres.length}` : initiales(c.autres[0]?.nom ?? '?')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{titre}</span>
                            {c.dernierMessage && (
                              <span className="ml-auto text-[11px] text-zinc-400 tabular-nums shrink-0">
                                {dateCourte.format(new Date(c.dernierMessage.createdAt))}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                              {c.dernierMessage ? `${c.dernierMessage.authorName} : ${c.dernierMessage.body}` : 'Nouvelle conversation'}
                            </span>
                            {c.nonLus > 0 && (
                              <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full text-[11px] font-medium bg-orange-500 text-white grid place-items-center tabular-nums shrink-0">
                                {c.nonLus}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {visibles.length === 0 && directsVisibles.length === 0 && clientsVisibles.length === 0 && (
            <p className="px-3 py-8 text-[13px] text-zinc-500 dark:text-zinc-400 text-center">
              {q ? 'Aucune conversation ne correspond.' : 'Aucune discussion pour l’instant.'}
            </p>
          )}
          {[...groupes.entries()].map(([client, liste]) => (
            <div key={client} className="mb-2">
              <p className="flex items-center justify-between px-2.5 pt-2 pb-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                <span className="truncate">{client}</span>
                <span className="tabular-nums">{liste.length}</span>
              </p>
              <ul className="space-y-0.5">
                {liste.map((f) => {
                  const actif = ouvert?.dossier.id === f.dossier.id;
                  return (
                    <li key={f.dossier.id}>
                      <Link
                        href={lienFil(f.dossier.id)}
                        aria-current={actif ? 'page' : undefined}
                        className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${
                          actif ? 'bg-orange-50 dark:bg-orange-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {initiales(f.dossier.formation ?? f.dossier.titre)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.dossier.formation ?? f.dossier.titre}</span>
                            {f.dernierMessage && (
                              <span className="ml-auto text-[11px] text-zinc-400 tabular-nums shrink-0">
                                {dateCourte.format(new Date(f.dernierMessage.createdAt))}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                              {f.dernierMessage ? `${f.dernierMessage.authorName} : ${f.dernierMessage.body}` : f.dossier.reference}
                            </span>
                            {f.mentionsNonLues > 0 ? (
                              <span className="ml-auto inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[11px] font-medium bg-rose-500 text-white tabular-nums shrink-0">
                                <AtSign className="w-3 h-3" />
                                {f.mentionsNonLues}
                              </span>
                            ) : f.nonLus > 0 ? (
                              <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full text-[11px] font-medium bg-orange-500 text-white grid place-items-center tabular-nums shrink-0">
                                {f.nonLus}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── La discussion ────────────────────────────────────────── */}
      {client && repondreClient ? (
        <section className="flex flex-col min-h-0 min-w-0" aria-label={`Échanges avec ${client.entreprise ?? client.nom}`}>
          <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <Link href={chemin} className="lg:hidden mb-1 inline-flex items-center gap-1 text-[12px] text-zinc-500">
                <ArrowLeft className="w-3.5 h-3.5" /> Conversations
              </Link>
              <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {client.dossier?.formation ?? client.entreprise ?? client.nom}
              </h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                {client.entreprise ?? client.nom}
                {client.dossier && (
                  <>
                    {' '}
                    · <span className="font-mono">{client.dossier.reference}</span>
                  </>
                )}{' '}
                · {client.nom} — {client.interlocuteurUserId ? 'message personnel, visible par vous seul' : 'visible par toute l’équipe'}
              </p>
            </div>
            {client.dossier && (
              <Link
                href={`/dossiers/${client.dossier.id}`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Page du dossier <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <FilMessages messages={client.messages} noms={[client.nom]} meId={meId} vide="Aucun message pour l’instant." />
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
            <ComposerDirect key={`${client.contactId}-${client.interlocuteurUserId ?? ''}`} conversationId={client.contactId} envoyer={repondreClient}
              initial={`@${client.nom} `}
              fichierVers={{ url: `/api/messagerie/client/${client.contactId}`, champs: client.interlocuteurUserId ? { interlocuteur: client.interlocuteurUserId } : {} }}
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">La réponse rejoint son espace entreprise ; un e-mail l’en prévient.</p>
          </div>
        </section>
      ) : direct ? (
        <section className="flex flex-col min-h-0 min-w-0" aria-label={`Conversation avec ${titreConversation(direct.conversation.autres)}`}>
          <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <Link href={chemin} className="lg:hidden mb-1 inline-flex items-center gap-1 text-[12px] text-zinc-500">
              <ArrowLeft className="w-3.5 h-3.5" /> Conversations
            </Link>
            <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {titreConversation(direct.conversation.autres)}
            </h2>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
              Message direct · {direct.conversation.autres.map((a) => a.fonction).filter((f, i, t) => t.indexOf(f) === i).join(', ')}
            </p>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <FilMessages messages={direct.messages} noms={[]} meId={meId} vide="Écrivez le premier message." />
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
            <ComposerDirect conversationId={direct.conversation.id} envoyer={envoyerDirect} />
          </div>
        </section>
      ) : ouvert ? (
        <section className="flex flex-col min-h-0 min-w-0" aria-label={`Discussion ${ouvert.dossier.titre}`}>
          <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <Link href={chemin} className="lg:hidden mb-1 inline-flex items-center gap-1 text-[12px] text-zinc-500">
                <ArrowLeft className="w-3.5 h-3.5" /> Conversations
              </Link>
              <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{ouvert.dossier.formation ?? ouvert.dossier.titre}</h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                {ouvert.dossier.titre} · <span className="font-mono">{ouvert.dossier.reference}</span>
              </p>
            </div>
            {ouvert.lien && (
              <Link
                href={ouvert.lien}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Page du dossier <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </header>

          <div className="px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2" role="tablist" aria-label="Messages affichés">
            {[
              { cle: 'tout' as const, libelle: 'Tout le fil', extra: '' },
              { cle: 'moi' as const, libelle: 'Pour moi', extra: '&vue=moi' },
              ...(duClient ? [{ cle: 'client' as const, libelle: `Client · ${duClient.nom}`, extra: '&vue=client' }] : []),
            ].map((t) => (
              <Link
                key={t.cle}
                role="tab"
                aria-selected={vue === t.cle}
                href={lienFil(ouvert.dossier.id, t.extra)}
                className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] transition ${
                  vue === t.cle
                    ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900/60 font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {t.libelle}
              </Link>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <FilMessages
              messages={messages}
              noms={[...ouvert.equipe.map((m) => m.nom), ...(duClient ? [duClient.nom] : [])]}
              meId={meId}
              vide={
                vue === 'moi'
                  ? 'Personne ne vous a encore mentionné ici.'
                  : ongletClient
                    ? `Aucun échange avec ${duClient.nom} pour l’instant. Écrivez-lui ci-dessous : le message rejoint son espace entreprise.`
                    : undefined
              }
            />
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
            {ongletClient && repondreClient ? (
              <>
                <ComposerDirect
                  key={`client-${duClient.contactId}`}
                  conversationId={duClient.contactId}
                  envoyer={repondreClient}
                  initial={`@${duClient.nom} `}
                  fichierVers={{ url: `/api/messagerie/client/${duClient.contactId}`, champs: {} }}
                />
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                  Envoyé à {duClient.nom}, dans son espace entreprise ; un e-mail l’en prévient.
                </p>
              </>
            ) : (
              <>
                <ComposerEquipe
                  dossierId={ouvert.dossier.id}
                  membres={ouvert.equipe.filter((m) => m.userId !== meId).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role }))}
                  envoyer={envoyer}
                />
                {duClient && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                    Message interne à l’équipe.{' '}
                    <Link href={lienFil(ouvert.dossier.id, '&vue=client')} className="text-orange-600 dark:text-orange-400 hover:underline">
                      Écrire à {duClient.nom}
                    </Link>
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="hidden lg:grid place-items-center p-8 min-h-0">
          <div className="text-center max-w-sm">
            <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              <MessagesSquare className="h-6 w-6" />
            </span>
            <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Choisissez une conversation</p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              Une discussion par dossier, avec ses formateurs et l&apos;équipe, ou un message direct à une ou plusieurs personnes
              avec « Nouvelle ».
            </p>
          </div>
        </section>
      )}

      {/* ── Participants d'une conversation directe ──────────────── */}
      {direct && (
        <aside className="hidden xl:block min-h-0 overflow-y-auto border-l border-zinc-200/70 dark:border-zinc-800 p-5">
          <section className="space-y-2.5">
            <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Participants · <span className="tabular-nums">{direct.conversation.autres.length + 1}</span>
            </h3>
            <ul className="space-y-2.5">
              {direct.conversation.autres.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5">
                  <span
                    className={`w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold ${
                      m.role === 'formateur'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                  >
                    {initiales(m.nom)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{m.nom}</span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{m.fonction}</span>
                  </span>
                </li>
              ))}
              <li className="text-[12px] text-zinc-500 dark:text-zinc-400">et vous</li>
            </ul>
          </section>
        </aside>
      )}

      {/* ── Infos du fil client ──────────────────────────────────── */}
      {client && (
        <aside className="hidden xl:block min-h-0 overflow-y-auto border-l border-zinc-200/70 dark:border-zinc-800 p-5 space-y-6">
          {client.infos && client.infos.lignes.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Infos rapides</h3>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                {client.infos.lignes.map((l) => (
                  <div key={l.libelle} className="contents">
                    <dt className="text-zinc-500 dark:text-zinc-400">{l.libelle}</dt>
                    <dd className="text-zinc-900 dark:text-zinc-100 tabular-nums break-words">{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className={`space-y-2.5 ${client.infos?.lignes.length ? 'pt-5 border-t border-zinc-100 dark:border-zinc-800' : ''}`}>
            <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Participants · <span className="tabular-nums">{client.lecteurs.length + 1}</span>
            </h3>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {initiales(client.nom)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{client.nom}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">Référent client</span>
                </span>
              </li>
              {client.lecteurs.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {initiales(m.nom)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {m.nom}
                      {m.userId === meId && <span className="text-zinc-400 font-normal"> · vous</span>}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{m.fonction}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      )}

      {/* ── Infos rapides et équipe ──────────────────────────────── */}
      {ouvert && (
        <aside className="hidden xl:block min-h-0 overflow-y-auto border-l border-zinc-200/70 dark:border-zinc-800 p-5 space-y-6">
          {ouvert.infos && ouvert.infos.lignes.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Infos rapides</h3>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                {ouvert.infos.lignes.map((l) => (
                  <div key={l.libelle} className="contents">
                    <dt className="text-zinc-500 dark:text-zinc-400">{l.libelle}</dt>
                    <dd className="text-zinc-900 dark:text-zinc-100 tabular-nums break-words">{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="space-y-2.5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Équipe · <span className="tabular-nums">{ouvert.equipe.length}</span>
            </h3>
            <ul className="space-y-2.5">
              {duClient && (
                <li className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {initiales(duClient.nom)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{duClient.nom}</span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">Référent client · onglet Client</span>
                  </span>
                </li>
              )}
              {ouvert.equipe.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5">
                  <span
                    className={`w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold ${
                      m.role === 'formateur'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                  >
                    {initiales(m.nom)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {m.nom}
                      {m.userId === meId && <span className="text-zinc-400 font-normal"> · vous</span>}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">{m.fonction}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      )}
    </div>
  );
}
