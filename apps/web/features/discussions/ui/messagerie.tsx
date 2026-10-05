import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, AtSign, MessagesSquare, Plus, Search } from 'lucide-react';
import type { Fil, MessageEquipe } from '../store';
import type { LibelleDossier, MembreDiscussion } from '../equipe';
import type { InfosFil } from '../infos-fil';
import { FilMessages } from './fil-messages';
import { ComposerEquipe } from './composer.client';

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
  /** Page du dossier ou de la séance ; absente pour qui n'y a pas accès. */
  lien: string | null;
};

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
}) {
  const q = normaliser(recherche.trim());
  const visibles = q
    ? fils.filter((f) =>
        normaliser([f.dossier.titre, f.dossier.reference, f.dossier.formation ?? '', f.dernierMessage?.body ?? ''].join(' ')).includes(q),
      )
    : fils;

  // Les fils d'un même client ensemble ; les séances sans dossier à part.
  const groupes = new Map<string, Fil[]>();
  for (const f of visibles) {
    const cle = f.dossier.reference.startsWith('Séance du') ? 'Séances sans dossier' : f.dossier.titre;
    groupes.set(cle, [...(groupes.get(cle) ?? []), f]);
  }
  const lienFil = (id: string, extra = '') => `${chemin}?dossier=${id}${q ? `&q=${encodeURIComponent(recherche)}` : ''}${extra}`;
  const messages = ouvert && pourMoi ? ouvert.messages.filter((m) => m.mentions.includes(meId) || m.authorUserId === meId) : (ouvert?.messages ?? []);

  return (
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px] rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden lg:h-[calc(100vh-12rem)] lg:min-h-[560px]">
      {/* ── Les fils ─────────────────────────────────────────────── */}
      <aside className={`${ouvert ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 border-r border-zinc-200/70 dark:border-zinc-800`}>
        <div className="p-4 space-y-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Conversations</h2>
            {aOuvrir.length > 0 && (
              <details className="relative">
                <summary className="list-none cursor-pointer inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <Plus className="w-3.5 h-3.5" /> Nouvelle
                </summary>
                <form action={chemin} className="absolute right-0 z-20 mt-1.5 w-72 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-md space-y-2">
                  <label htmlFor="ouvrir-dossier" className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                    Ouvrir la discussion d&apos;un dossier
                  </label>
                  <select
                    id="ouvrir-dossier"
                    name="dossier"
                    defaultValue=""
                    className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[12px]"
                  >
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {aOuvrir.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.titre} · {d.reference}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="w-full h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium">
                    Ouvrir
                  </button>
                </form>
              </details>
            )}
          </div>
          <form action={chemin} role="search" className="relative">
            {ouvert && <input type="hidden" name="dossier" value={ouvert.dossier.id} />}
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <label htmlFor="recherche-fils" className="sr-only">
              Rechercher une conversation
            </label>
            <input
              id="recherche-fils"
              name="q"
              defaultValue={recherche}
              placeholder="Client, dossier, message…"
              className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </form>
        </div>

        <nav aria-label="Conversations" className="flex-1 min-h-0 overflow-y-auto p-2">
          {visibles.length === 0 && (
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
      {ouvert ? (
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
                {ouvert.infos?.kind === 'seance' ? 'Page de la séance' : 'Page du dossier'} <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </header>

          <div className="px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2" role="tablist" aria-label="Messages affichés">
            {[
              { cle: false, libelle: 'Tout le fil' },
              { cle: true, libelle: 'Pour moi' },
            ].map((t) => (
              <Link
                key={t.libelle}
                role="tab"
                aria-selected={pourMoi === t.cle}
                href={lienFil(ouvert.dossier.id, t.cle ? '&vue=moi' : '')}
                className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] transition ${
                  pourMoi === t.cle
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
              noms={ouvert.equipe.map((m) => m.nom)}
              meId={meId}
              vide={pourMoi ? 'Personne ne vous a encore mentionné ici.' : undefined}
            />
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
            <ComposerEquipe
              dossierId={ouvert.dossier.id}
              membres={ouvert.equipe.filter((m) => m.userId !== meId).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role }))}
              envoyer={envoyer}
            />
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
              Une discussion par dossier, avec ses formateurs et l&apos;équipe. Mentionnez la personne concernée avec @ : elle est prévenue.
            </p>
          </div>
        </section>
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
