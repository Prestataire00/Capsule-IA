'use client';

// ARCHETYPE: workflow — saisie manuelle des indicateurs de résultats.
import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, Loader2, AlertCircle, PenLine } from 'lucide-react';
import { saveDeclaredIndicator, deleteDeclaredIndicator } from './actions';

export type LigneDeclaree = {
  id: string;
  formationId: string | null;
  formationTitle: string | null;
  year: number;
  learnersTrained: number | null;
  satisfactionRate: number | null;
  satisfactionResponses: number | null;
  responseRate: number | null;
  formationsDelivered: number | null;
  source: string;
  note: string | null;
};

type Formation = { id: string; title: string };

const vide = (annee: number): LigneDeclaree => ({
  id: '',
  formationId: null,
  formationTitle: null,
  year: annee,
  learnersTrained: null,
  satisfactionRate: null,
  satisfactionResponses: null,
  responseRate: null,
  formationsDelivered: null,
  source: '',
  note: null,
});

const nb = (v: number | null): string => (v === null ? '' : String(v));

export function DeclaredPanel({
  lignes,
  formations,
  anneeParDefaut,
}: {
  lignes: LigneDeclaree[];
  formations: Formation[];
  anneeParDefaut: number;
}) {
  const [edition, setEdition] = useState<LigneDeclaree | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const enregistrer = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setErreur(null);
    startTransition(async () => {
      const res = await saveDeclaredIndicator({
        id: fd.get('id') || undefined,
        formationId: fd.get('formationId'),
        year: fd.get('year'),
        learnersTrained: fd.get('learnersTrained'),
        satisfactionRate: fd.get('satisfactionRate'),
        satisfactionResponses: fd.get('satisfactionResponses'),
        responseRate: fd.get('responseRate'),
        formationsDelivered: fd.get('formationsDelivered'),
        source: fd.get('source'),
        note: fd.get('note'),
      });
      if (res.ok) setEdition(null);
      else setErreur(res.error);
    });
  };

  const supprimer = (id: string) => {
    startTransition(async () => {
      const res = await deleteDeclaredIndicator(id);
      if (!res.ok) setErreur(res.error);
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <PenLine className="w-4 h-4 text-zinc-400" /> Chiffres déclarés
          </h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-2xl">
            Pour vos résultats antérieurs à Capsule, ou obtenus hors plateforme. Ils s&apos;ajoutent aux
            chiffres calculés — ils ne les remplacent jamais — et remontent sur les fiches publiques.
          </p>
        </div>
        {!edition && (
          <button
            type="button"
            onClick={() => setEdition(vide(anneeParDefaut))}
            className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Déclarer des résultats
          </button>
        )}
      </div>

      {erreur && (
        <div className="mx-5 mt-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-900 dark:text-red-200">{erreur}</p>
        </div>
      )}

      {edition && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            enregistrer(e.currentTarget);
          }}
          className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 space-y-4"
        >
          <input type="hidden" name="id" defaultValue={edition.id} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Champ label="Année">
              <input
                name="year"
                type="number"
                defaultValue={edition.year}
                min={2000}
                max={2100}
                className={styleChamp}
              />
            </Champ>
            <div className="sm:col-span-2">
              <Champ label="Périmètre">
                <select name="formationId" defaultValue={edition.formationId ?? ''} className={styleChamp}>
                  <option value="">Tout l&apos;organisme</option>
                  {formations.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Champ label="Apprenants formés">
              <input name="learnersTrained" type="number" min={0} defaultValue={nb(edition.learnersTrained)} className={styleChamp} />
            </Champ>
            <Champ label="Satisfaction (sur 100)">
              <input name="satisfactionRate" type="number" min={0} max={100} step="0.1" defaultValue={nb(edition.satisfactionRate)} className={styleChamp} />
            </Champ>
            <Champ label="Réponses obtenues">
              <input name="satisfactionResponses" type="number" min={0} defaultValue={nb(edition.satisfactionResponses)} className={styleChamp} />
            </Champ>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Taux de retour (%)" aide="Laissez vide au niveau d'une formation">
              <input name="responseRate" type="number" min={0} max={100} step="0.1" defaultValue={nb(edition.responseRate)} className={styleChamp} />
            </Champ>
            <Champ label="Formations dispensées" aide="Uniquement pour l'organisme entier">
              <input name="formationsDelivered" type="number" min={0} defaultValue={nb(edition.formationsDelivered)} className={styleChamp} />
            </Champ>
          </div>

          <Champ label="Provenance des chiffres" aide="Exigée en cas de contrôle Qualiopi">
            <input
              name="source"
              defaultValue={edition.source}
              placeholder="Export Digiforma 2025, registre interne…"
              className={styleChamp}
            />
          </Champ>

          <Champ label="Note (facultatif)">
            <textarea name="note" rows={2} defaultValue={edition.note ?? ''} className={styleChamp} />
          </Champ>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setEdition(null);
                setErreur(null);
              }}
              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {lignes.length === 0 && !edition ? (
        <p className="px-5 py-6 text-[12px] text-zinc-500 dark:text-zinc-400">
          Aucun chiffre déclaré. Vos résultats des années précédentes peuvent être saisis ici pour
          apparaître dès maintenant sur vos fiches publiques.
        </p>
      ) : (
        lignes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50/60 dark:bg-zinc-950/40">
                  <th className="px-5 py-2.5 font-medium">Année</th>
                  <th className="px-5 py-2.5 font-medium">Périmètre</th>
                  <th className="px-5 py-2.5 font-medium text-right">Apprenants</th>
                  <th className="px-5 py-2.5 font-medium text-right">Satisfaction</th>
                  <th className="px-5 py-2.5 font-medium">Provenance</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} className="border-t border-zinc-200/60 dark:border-zinc-800">
                    <td className="px-5 py-3 tabular-nums">{l.year}</td>
                    <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                      {l.formationTitle ?? <span className="text-zinc-500">Tout l&apos;organisme</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{l.learnersTrained ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {l.satisfactionRate === null ? '—' : `${l.satisfactionRate} %`}
                      {l.satisfactionResponses !== null && (
                        <span className="text-zinc-400 text-[11px]"> · {l.satisfactionResponses} rép.</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-zinc-500 dark:text-zinc-400">{l.source}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEdition(l)}
                        className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition p-1"
                        aria-label={`Modifier la déclaration ${l.year}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => supprimer(l.id)}
                        disabled={pending}
                        className="text-zinc-400 hover:text-red-600 transition p-1 disabled:opacity-40"
                        aria-label={`Supprimer la déclaration ${l.year}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

const styleChamp =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition';

function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</span>
      {children}
      {aide && <span className="block text-[11px] text-zinc-400 mt-1">{aide}</span>}
    </label>
  );
}
