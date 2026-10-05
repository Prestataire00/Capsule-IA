import Link from 'next/link';
import { AtSign, MessagesSquare } from 'lucide-react';
import type { Fil, MessageEquipe } from '../store';
import type { LibelleDossier, MembreDiscussion } from '../equipe';
import { FilMessages } from './fil-messages';
import { ComposerEquipe } from './composer.client';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

/**
 * La messagerie d'équipe, classée par dossier : la liste des fils à gauche,
 * le fil ouvert à droite. Même écran pour l'organisme et pour le formateur ;
 * seuls changent le chemin, l'action d'envoi et les dossiers proposés.
 */
export function Messagerie({
  chemin,
  fils,
  aOuvrir,
  ouvert,
  envoyer,
  meId,
}: {
  chemin: string;
  fils: readonly Fil[];
  /** Dossiers sans fil encore, pour en démarrer un. */
  aOuvrir: readonly LibelleDossier[];
  ouvert: { dossier: LibelleDossier; messages: readonly MessageEquipe[]; equipe: readonly MembreDiscussion[] } | null;
  envoyer: (input: { dossierId: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  meId: string;
}) {
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <aside className="space-y-3">
        <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden shadow-sm">
          {fils.length === 0 && (
            <li className="px-4 py-6 text-[13px] text-zinc-500 dark:text-zinc-400 text-center">Aucune discussion pour l&apos;instant.</li>
          )}
          {fils.map((f) => {
            const actif = ouvert?.dossier.id === f.dossier.id;
            return (
              <li key={f.dossier.id}>
                <Link
                  href={`${chemin}?dossier=${f.dossier.id}`}
                  className={`block px-4 py-3 transition ${actif ? 'bg-orange-50 dark:bg-orange-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.dossier.titre}</span>
                    {f.mentionsNonLues > 0 && (
                      <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[11px] font-medium bg-rose-500 text-white tabular-nums">
                        <AtSign className="w-3 h-3" />
                        {f.mentionsNonLues}
                      </span>
                    )}
                    {f.nonLus > 0 && f.mentionsNonLues === 0 && (
                      <span className="h-5 min-w-5 px-1.5 rounded-full text-[11px] font-medium bg-orange-500 text-white grid place-items-center tabular-nums">
                        {f.nonLus}
                      </span>
                    )}
                    {f.dernierMessage && (
                      <span className="ml-auto text-[11px] text-zinc-400 tabular-nums shrink-0">
                        {dateFmt.format(new Date(f.dernierMessage.createdAt))}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    <span className="font-mono">{f.dossier.reference}</span>
                    {f.dossier.formation ? ` · ${f.dossier.formation}` : ''}
                  </span>
                  {f.dernierMessage && (
                    <span className="block text-[12px] text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                      {f.dernierMessage.authorName} : {f.dernierMessage.body}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {aOuvrir.length > 0 && (
          <form action={chemin} className="flex gap-2">
            <label className="sr-only" htmlFor="ouvrir-dossier">
              Ouvrir la discussion d&apos;un dossier
            </label>
            <select
              id="ouvrir-dossier"
              name="dossier"
              defaultValue=""
              className="flex-1 min-w-0 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[12px]"
            >
              <option value="" disabled>
                Discuter d&apos;un autre dossier…
              </option>
              {aOuvrir.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titre} · {d.reference}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Ouvrir
            </button>
          </form>
        )}
      </aside>

      <section className="space-y-4 min-w-0">
        {ouvert ? (
          <>
            <header className="space-y-1.5">
              <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">{ouvert.dossier.titre}</h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                <span className="font-mono">{ouvert.dossier.reference}</span>
                {ouvert.dossier.formation ? ` · ${ouvert.dossier.formation}` : ''}
                {' · '}
                {ouvert.equipe.map((m) => m.nom).join(', ')}
              </p>
            </header>
            <FilMessages messages={ouvert.messages} noms={ouvert.equipe.map((m) => m.nom)} meId={meId} />
            <ComposerEquipe
              dossierId={ouvert.dossier.id}
              membres={ouvert.equipe.filter((m) => m.userId !== meId).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role }))}
              envoyer={envoyer}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-16 text-center">
            <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              <MessagesSquare className="h-6 w-6" />
            </span>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Choisissez un dossier pour lire sa discussion, ou ouvrez-en une nouvelle.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
