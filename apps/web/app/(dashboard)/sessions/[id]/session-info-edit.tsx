'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Save } from 'lucide-react';
import { updateSessionInfo } from './informations-actions';

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

/** « Modifier » : capacité, tarif par participant, groupe visé et notes. */
export function SessionInfoEdit({
  sessionId,
  initial,
  groupes = [],
}: {
  sessionId: string;
  initial: { capacityMax: string; priceEuros: string; notes: string; groupeId: string };
  /** Groupes du dossier (0194) ; vide = le choix ne se pose pas. */
  groupes?: ReadonlyArray<{ id: string; nom: string }>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <Pencil className="w-3.5 h-3.5" /> Modifier
      </button>
    );
  }

  return (
    <form
      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        start(async () => {
          const r = await updateSessionInfo({ sessionId, ...f });
          if (r.ok) {
            setOuvert(false);
            router.refresh();
          } else setErreur(r.error);
        });
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Capacité (places)</span>
          <input value={f.capacityMax} onChange={(e) => setF({ ...f, capacityMax: e.target.value })} inputMode="numeric" className={`${champ} tabular-nums`} placeholder="Ex. 8" />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Tarif par participant HT (€)</span>
          <input value={f.priceEuros} onChange={(e) => setF({ ...f, priceEuros: e.target.value })} inputMode="decimal" className={`${champ} tabular-nums`} placeholder="Vide = tarif de la formation" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Notes</span>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} maxLength={2000} className={champ} />
      </label>

      {/* Le groupe se choisissait à la création seulement : six séances déjà
          créées n'avaient aucun moyen d'en recevoir un. */}
      {groupes.length > 0 && (
        <label className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
          Groupe concerné
          <select
            value={f.groupeId}
            onChange={(e) => setF({ ...f, groupeId: e.target.value })}
            className={champ}
          >
            <option value="">Tout le dossier</option>
            {groupes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
          <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400 mt-1">
            Changer le groupe met les participants à jour : ceux qui n’en sont pas cessent d’être attendus.
          </span>
        </label>
      )}

      {erreur && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-40">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Enregistrer
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="text-[13px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2">
          Annuler
        </button>
      </div>
    </form>
  );
}
