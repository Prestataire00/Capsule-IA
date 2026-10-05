'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Shuffle, Users } from 'lucide-react';
import { nomsDeGroupes, problemeDeRepartition, repartitionEquilibree } from '@/features/sessions/repartition';
import { repartirSeance } from '@/features/sessions/repartir-seance';

const TONS = [
  'bg-blue-500 text-white',
  'bg-rose-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-purple-500 text-white',
  'bg-teal-500 text-white',
];

/** Répartir les stagiaires de la séance en groupes, d'un toucher par stagiaire. */
export function Repartir({
  sessionId,
  stagiaires,
  formateurs,
  formateurActuel,
  seancesSuivantes,
  porteur,
}: {
  sessionId: string;
  stagiaires: ReadonlyArray<{ id: string; nom: string }>;
  formateurs: ReadonlyArray<{ id: string; nom: string }>;
  formateurActuel: string | null;
  seancesSuivantes: number;
  /** Qui porte les groupes : le dossier, ou le client d'une séance sans dossier. */
  porteur: 'dossier' | 'client';
}) {
  const router = useRouter();
  const [nb, setNb] = useState(2);
  const [noms, setNoms] = useState(nomsDeGroupes(6));
  const [formateurDe, setFormateurDe] = useState<Array<string>>(Array(6).fill(''));
  const [groupeDe, setGroupeDe] = useState<Map<string, number>>(new Map());
  const [suite, setSuite] = useState(true);
  const [creerSeances, setCreerSeances] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const groupes = useMemo(
    () =>
      Array.from({ length: nb }, (_, i) => ({
        nom: noms[i] ?? `Groupe ${i + 1}`,
        learnerIds: stagiaires.filter((s) => groupeDe.get(s.id) === i).map((s) => s.id),
        trainerId: formateurDe[i] || null,
      })),
    [nb, noms, stagiaires, groupeDe, formateurDe],
  );
  const probleme = problemeDeRepartition(groupes, stagiaires.map((s) => s.id));

  const auto = () => {
    const parts = repartitionEquilibree([...stagiaires].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), nb);
    setGroupeDe(new Map(parts.flatMap((p, i) => p.map((s) => [s.id, i] as const))));
  };

  const valider = () =>
    start(async () => {
      setErreur(null);
      if (probleme) return setErreur(probleme);
      const r = await repartirSeance({ sessionId, groupes, appliquerSuite: suite, creerSeances });
      if (!r.ok) return setErreur(r.error);
      // Groupes seuls : on rattache ensuite chaque séance au sien, dans ses informations.
      router.push(creerSeances ? `/sessions/${sessionId}/apprenants` : `/sessions/${sessionId}`);
      router.refresh();
    });

  const champ = 'h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] min-w-0';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] text-zinc-600 dark:text-zinc-300">Nombre de groupes</span>
        {[2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setNb(n);
              setGroupeDe((prev) => new Map([...prev].filter(([, g]) => g < n)));
            }}
            className={`w-9 h-9 rounded-lg text-[13px] font-medium tabular-nums ${
              nb === n ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={auto}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <Shuffle className="w-4 h-4" /> Répartir automatiquement
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groupes.map((g, i) => (
          <div key={i} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-lg grid place-items-center text-[12px] font-semibold ${TONS[i % TONS.length]}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <input
                value={noms[i] ?? ''}
                onChange={(e) => setNoms((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                aria-label={`Nom du groupe ${i + 1}`}
                className={`${champ} flex-1`}
              />
              <span className="text-[12px] text-zinc-500 tabular-nums inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {g.learnerIds.length}
              </span>
            </div>
            <select
              value={formateurDe[i] ?? ''}
              onChange={(e) => setFormateurDe((prev) => prev.map((f, j) => (j === i ? e.target.value : f)))}
              aria-label={`Formateur du groupe ${i + 1}`}
              className={`${champ} w-full`}
            >
              <option value="">
                {formateurActuel ? `Formateur de la séance (${formateurs.find((f) => f.id === formateurActuel)?.nom ?? '—'})` : 'Formateur de la séance'}
              </option>
              {formateurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 shadow-sm">
        {stagiaires.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[14px] text-zinc-900 dark:text-zinc-100 truncate">{s.nom}</span>
            <span className="flex gap-1.5 shrink-0">
              {groupes.map((_, i) => {
                const actif = groupeDe.get(s.id) === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGroupeDe((prev) => new Map(prev).set(s.id, i))}
                    aria-pressed={actif}
                    aria-label={`${s.nom} dans ${groupes[i]?.nom}`}
                    className={`w-10 h-10 rounded-lg text-[14px] font-semibold transition ${
                      actif ? TONS[i % TONS.length] : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200'
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>

      <fieldset className="space-y-2">
        <legend className="text-[13px] text-zinc-600 dark:text-zinc-300 mb-1">Et ensuite</legend>
        <label className="flex items-start gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
          <input type="radio" name="mode" checked={creerSeances} onChange={() => setCreerSeances(true)} className="w-4 h-4 mt-0.5" />
          <span>Répartir cette séance : chaque groupe a sa séance au même créneau</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
          <input type="radio" name="mode" checked={!creerSeances} onChange={() => setCreerSeances(false)} className="w-4 h-4 mt-0.5" />
          <span>Créer seulement les groupes — je rattache ensuite chaque séance à son groupe (Informations › Modifier)</span>
        </label>
      </fieldset>

      <div className="flex items-center gap-4 flex-wrap">
        {creerSeances && seancesSuivantes > 0 && (
          <label className="inline-flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={suite} onChange={(e) => setSuite(e.target.checked)} className="w-4 h-4" />
            Appliquer aux {seancesSuivantes} séance{seancesSuivantes > 1 ? 's' : ''} suivante{seancesSuivantes > 1 ? 's' : ''}{' '}
            {porteur === 'dossier' ? 'du dossier' : 'de ce client'}
          </label>
        )}
        <button
          type="button"
          onClick={valider}
          disabled={pending}
          className="ml-auto h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-medium inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} {creerSeances ? 'Valider la répartition' : 'Créer les groupes'}
        </button>
      </div>
      {(erreur ?? (groupeDe.size > 0 ? probleme : null)) && (
        <p className="text-[13px] text-red-600 dark:text-red-400 text-right">{erreur ?? probleme}</p>
      )}
    </div>
  );
}
