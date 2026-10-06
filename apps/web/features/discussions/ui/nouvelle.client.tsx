'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';
import { nouvelleConversationSchema } from '../discussion.schema';
import type { Interlocuteur } from '../directs';
import type { LibelleDossier } from '../equipe';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * « Nouvelle » : écrire à une ou plusieurs personnes, ou ouvrir la discussion
 * d'un dossier. Une conversation avec les mêmes personnes reprend celle qui existe.
 */
export function NouvelleConversation({
  chemin,
  joignables,
  dossiers,
  ouvrir,
}: {
  chemin: string;
  joignables: readonly Interlocuteur[];
  dossiers: readonly LibelleDossier[];
  ouvrir: (input: { avec: string[] }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [choisis, setChoisis] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visibles = useMemo(() => {
    const q = normaliser(filtre.trim());
    return q ? joignables.filter((j) => normaliser(`${j.nom} ${j.fonction}`).includes(q)) : joignables;
  }, [filtre, joignables]);

  const basculer = (id: string) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const ecrire = () =>
    start(async () => {
      setErreur(null);
      const p = nouvelleConversationSchema.safeParse({ avec: choisis });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Choix invalide.');
      const r = await ouvrir(p.data);
      if (!r.ok) return setErreur(r.error);
      setOuvert(false);
      setChoisis([]);
      router.push(`${chemin}?direct=${r.id}`);
    });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <Plus className="w-3.5 h-3.5" /> Nouvelle
      </button>
      {ouvert && (
        <div className="absolute inset-x-3 top-14 z-20 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-md space-y-3">
          <section className="space-y-2" aria-label="Écrire à des personnes">
            <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">Écrire à des personnes</p>
            {joignables.length === 0 ? (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Personne d’autre n’a encore de compte.</p>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
                  <label htmlFor="nouvelle-filtre" className="sr-only">
                    Chercher une personne
                  </label>
                  <input
                    id="nouvelle-filtre"
                    value={filtre}
                    onChange={(e) => setFiltre(e.target.value)}
                    placeholder="Chercher une personne…"
                    className="w-full h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <ul className="max-h-56 overflow-y-auto space-y-0.5" aria-label="Personnes">
                  {visibles.map((j) => (
                    <li key={j.userId}>
                      <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={choisis.includes(j.userId)}
                          onChange={() => basculer(j.userId)}
                          className="accent-orange-500"
                        />
                        <span className="min-w-0">
                          <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{j.nom}</span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{j.fonction}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {visibles.length === 0 && <li className="px-2 py-2 text-[12px] text-zinc-500">Aucune personne ne correspond.</li>}
                </ul>
                {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
                <button
                  type="button"
                  onClick={ecrire}
                  disabled={pending || choisis.length === 0}
                  className="w-full h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {choisis.length > 1 ? `Écrire à ces ${choisis.length} personnes` : 'Écrire'}
                </button>
              </>
            )}
          </section>

          {dossiers.length > 0 && (
            <form action={chemin} className="space-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <label htmlFor="ouvrir-dossier" className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                Ou ouvrir la discussion d&apos;un dossier
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
                {dossiers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.titre} · {d.reference}
                  </option>
                ))}
              </select>
              <button type="submit" className="w-full h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                Ouvrir
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
