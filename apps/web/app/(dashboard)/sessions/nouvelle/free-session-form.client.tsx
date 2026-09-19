'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, Loader2, Search, User, Users } from 'lucide-react';
import { createFreeSession } from './free-session-actions';
import { DisponibilitesPanel } from '@/features/trainer-space/ui/disponibilites-panel.client';

export type Option = { id: string; label: string };

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const etiquette = 'text-[12px] font-medium text-zinc-700 dark:text-zinc-300';

/** Arrondit à l'heure suivante : point de départ crédible pour une séance. */
function prochaineHeure(decalageJours = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + decalageJours);
  d.setMinutes(0, 0, 0);
  d.setHours(9);
  // Valeur d'un <input type="datetime-local"> : heure locale, sans fuseau.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const plusTrois = (debut: string): string => {
  const d = new Date(debut);
  if (Number.isNaN(d.getTime())) return debut;
  d.setHours(d.getHours() + 3);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Séance planifiée pour un client, sans formation ni dossier : intitulé libre,
 * entreprise cliente ou participants directs.
 */
export function FreeSessionForm({
  companies,
  learners,
  trainers,
}: {
  companies: Option[];
  learners: Option[];
  trainers: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const debutParDefaut = useMemo(() => prochaineHeure(), []);

  const [f, setF] = useState({
    title: '',
    companyId: '',
    modality: 'presentiel' as 'presentiel' | 'distanciel' | 'hybride',
    startsAt: debutParDefaut,
    endsAt: plusTrois(debutParDefaut),
    location: '',
    trainerId: '',
    priceEuros: '',
    capacityMax: '',
    notes: '',
  });
  const [choisis, setChoisis] = useState<string[]>([]);
  const [recherche, setRecherche] = useState('');

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = q ? learners.filter((l) => l.label.toLowerCase().includes(q)) : learners;
    return liste.slice(0, 50);
  }, [learners, recherche]);

  const bascule = (id: string) =>
    setChoisis((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        start(async () => {
          const r = await createFreeSession({
            ...f,
            // `datetime-local` n'a pas de fuseau : on l'interprète dans celui du navigateur.
            startsAt: new Date(f.startsAt).toISOString(),
            endsAt: new Date(f.endsAt).toISOString(),
            learnerIds: choisis,
          });
          if (!r.ok) {
            setErreur(r.error);
            return;
          }
          router.push(`/sessions/${r.sessionId}`);
        });
      }}
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
        <label className="block space-y-1">
          <span className={etiquette}>Intitulé de la séance</span>
          <input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            required
            autoFocus
            maxLength={200}
            placeholder="Ex. Accompagnement RH sur mesure — demi-journée 1"
            className={champ}
          />
        </label>

        <label className="block space-y-1">
          <span className={etiquette}>Client (entreprise)</span>
          <select value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })} className={champ}>
            <option value="">Aucune entreprise (particulier ou interne)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Pour un particulier, laissez vide et ajoutez-le dans les participants ci-dessous.
          </span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={etiquette}>Début</span>
            <input
              type="datetime-local"
              value={f.startsAt}
              onChange={(e) => setF({ ...f, startsAt: e.target.value, endsAt: plusTrois(e.target.value) })}
              required
              className={`${champ} tabular-nums`}
            />
          </label>
          <label className="block space-y-1">
            <span className={etiquette}>Fin</span>
            <input
              type="datetime-local"
              value={f.endsAt}
              onChange={(e) => setF({ ...f, endsAt: e.target.value })}
              required
              className={`${champ} tabular-nums`}
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={etiquette}>Modalité</span>
            <select
              value={f.modality}
              onChange={(e) => setF({ ...f, modality: e.target.value as typeof f.modality })}
              className={champ}
            >
              <option value="presentiel">Présentiel</option>
              <option value="distanciel">Distanciel</option>
              <option value="hybride">Hybride</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={etiquette}>Lieu</span>
            <input
              value={f.location}
              onChange={(e) => setF({ ...f, location: e.target.value })}
              maxLength={200}
              placeholder={f.modality === 'presentiel' ? 'Ex. Locaux du client, Rennes' : 'Optionnel'}
              className={champ}
            />
          </label>
        </div>

        <DisponibilitesPanel
          startsAtLocal={f.startsAt}
          endsAtLocal={f.endsAt}
          selectedTrainerId={f.trainerId}
          onSelect={(trainerId) => setF({ ...f, trainerId })}
        />

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className={etiquette}>Formateur</span>
            <select value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })} className={champ}>
              <option value="">À désigner</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={etiquette}>Tarif HT (€)</span>
            <input
              value={f.priceEuros}
              onChange={(e) => setF({ ...f, priceEuros: e.target.value })}
              inputMode="decimal"
              placeholder="Optionnel"
              className={`${champ} tabular-nums`}
            />
          </label>
          <label className="block space-y-1">
            <span className={etiquette}>Capacité</span>
            <input
              value={f.capacityMax}
              onChange={(e) => setF({ ...f, capacityMax: e.target.value })}
              inputMode="numeric"
              placeholder="Optionnel"
              className={`${champ} tabular-nums`}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={etiquette}>Notes</span>
          <textarea
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            rows={2}
            maxLength={2000}
            className={champ}
          />
        </label>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" aria-hidden /> Participants
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Inscrits directement à la séance : ils apparaissent dans l’émargement, sans dossier.
            </p>
          </div>
          <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
            {choisis.length} sélectionné{choisis.length > 1 ? 's' : ''}
          </span>
        </div>

        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun apprenant enregistré. Vous pouvez créer la séance et les ajouter plus tard.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" aria-hidden />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un apprenant…"
                className={`${champ} pl-9`}
              />
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80 rounded-lg border border-zinc-100 dark:border-zinc-800">
              {visibles.map((l) => {
                const actif = choisis.includes(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => bascule(l.id)}
                      aria-pressed={actif}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition"
                    >
                      <span
                        className={`w-4 h-4 rounded grid place-items-center border shrink-0 ${
                          actif ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                      >
                        {actif && <Check className="w-3 h-3" />}
                      </span>
                      <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">{l.label}</span>
                    </button>
                  </li>
                );
              })}
              {visibles.length === 0 && (
                <li className="px-3 py-3 text-[12px] text-zinc-500">Aucun apprenant ne correspond.</li>
              )}
            </ul>
          </>
        )}
      </div>

      {erreur && (
        <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending || f.title.trim() === ''}
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 inline-flex items-center gap-2 disabled:opacity-40"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Créer la séance
        </button>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
          {f.companyId ? <Building2 className="w-3.5 h-3.5" aria-hidden /> : <User className="w-3.5 h-3.5" aria-hidden />}
          {f.modality === 'presentiel'
            ? 'Aucune visio ne sera créée.'
            : 'Un lien Google Meet est créé si votre agenda Google est connecté.'}
        </p>
      </div>
    </form>
  );
}
