'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { affecterAuGroupe, creerGroupe, renommerGroupe, supprimerGroupe } from './groupes-actions';

/**
 * Répartir les stagiaires d'un dossier en groupes.
 *
 * Une entreprise forme seize personnes en deux groupes de huit, qui ne viennent
 * pas les mêmes demi-journées. Le groupe n'existait jusqu'ici que dans le titre
 * de la séance — « Groupe A (matin) » — donc nulle part : les seize étaient
 * attendus partout, et leurs feuilles d'émargement les listaient tous.
 *
 * Une case par stagiaire et par groupe, plutôt qu'une liste déroulante : c'est
 * la répartition entière qu'on veut voir, pas la ligne qu'on modifie. Et rien
 * n'interdit deux groupes pour la même personne — le tronc commun avec l'un, un
 * module avec l'autre.
 */
export type GroupeAffiche = {
  id: string;
  nom: string;
  membres: string[];
};

export type ApprenantAffiche = { id: string; nom: string };

export function Groupes({
  dossierId,
  groupes,
  apprenants,
}: {
  dossierId: string;
  groupes: GroupeAffiche[];
  apprenants: ApprenantAffiche[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState('');
  const [cible, setCible] = useState<string | null>(null);

  const agir = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErreur(null);
    setCible(id);
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) setErreur(r.error ?? 'L’action a échoué.');
      else router.refresh();
      setCible(null);
    });
  };

  const ajouter = () => {
    const nom = nouveau.trim();
    if (nom === '') return;
    agir('nouveau', async () => {
      const r = await creerGroupe({ dossierId, nom });
      if (r.ok) setNouveau('');
      return r;
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-8 h-8 rounded-lg grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          <Users className="w-4 h-4" />
        </span>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Groupes</h2>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          {groupes.length === 0
            ? 'Facultatif : sans groupe, chaque séance concerne tout le dossier.'
            : 'Une séance peut viser un groupe : elle n’attend alors que lui.'}
        </span>
      </div>

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ajouter();
            }
          }}
          maxLength={60}
          placeholder="Groupe A"
          aria-label="Nom du nouveau groupe"
          className="h-9 w-48 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800"
        />
        <button
          type="button"
          onClick={ajouter}
          disabled={enCours || nouveau.trim() === ''}
          className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {enCours && cible === 'nouveau' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Créer un groupe
        </button>
      </div>

      {groupes.length > 0 && apprenants.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200/70 dark:border-zinc-800">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zinc-50/70 dark:bg-zinc-950/40">
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 min-w-[180px]">
                  Stagiaire
                </th>
                {groupes.map((g) => (
                  <th key={g.id} className="px-3 py-2 min-w-[120px]">
                    <input
                      defaultValue={g.nom}
                      maxLength={60}
                      aria-label={`Nom du groupe ${g.nom}`}
                      onBlur={(e) => {
                        const nom = e.target.value.trim();
                        if (nom !== '' && nom !== g.nom) agir(g.id, () => renommerGroupe({ groupeId: g.id, nom }));
                      }}
                      className="w-full h-7 px-2 rounded-md bg-transparent text-[12px] font-bold text-zinc-800 dark:text-zinc-200 text-center hover:bg-white dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Supprimer le groupe « ${g.nom} » ?\n\nLes séances qui le visaient redeviennent celles de tout le dossier. Aucune séance n’est supprimée.`)) return;
                        agir(g.id, () => supprimerGroupe(g.id));
                      }}
                      disabled={enCours}
                      title={`Supprimer le groupe ${g.nom}`}
                      className="mt-1 text-[11px] text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" /> Supprimer
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apprenants.map((a) => (
                <tr key={a.id} className="border-t border-zinc-100 dark:border-zinc-800/80">
                  <td className="px-3 py-2 text-[13px] text-zinc-800 dark:text-zinc-200">{a.nom}</td>
                  {groupes.map((g) => {
                    const dedans = g.membres.includes(a.id);
                    return (
                      <td key={g.id} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={dedans}
                          disabled={enCours}
                          aria-label={`${a.nom} dans ${g.nom}`}
                          onChange={() =>
                            agir(`${g.id}:${a.id}`, () =>
                              affecterAuGroupe({ groupeId: g.id, learnerId: a.id, dedans: !dedans }),
                            )
                          }
                          className="w-4 h-4 accent-orange-500"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {groupes.length > 0 && apprenants.length === 0 && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Inscrivez d’abord des stagiaires : un groupe répartit les inscrits, il n’en ajoute pas.
        </p>
      )}
    </section>
  );
}
