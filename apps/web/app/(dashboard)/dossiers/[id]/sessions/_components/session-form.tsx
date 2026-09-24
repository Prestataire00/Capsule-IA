'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2, Video, Check } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { creerSeancesEnSerie, generateMeetForSession } from '../session-actions';
import {
  genererSeances,
  resumePlanification,
  MESSAGES_PLANIFICATION,
  JOURS_SEMAINE,
  JOURS_OUVRES,
  type Creneau,
} from '@/features/sessions/planification';
import { parseEurosToCents } from '@/features/billing/domain/quote';

const MODALITIES = [
  { v: 'presentiel', l: 'Présentiel' },
  { v: 'distanciel', l: 'Distanciel' },
  { v: 'hybride', l: 'Hybride' },
];

export type GroupeOption = { id: string; nom: string };

export function SessionForm({
  dossierId,
  groupes = [],
}: {
  dossierId: string;
  /** Groupes du dossier (0194) ; vide = le choix ne se pose pas. */
  groupes?: GroupeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialForm = {
    title: '',
    modality: 'distanciel',
    location: '',
    date: '',
    dateFin: '',
    plusieursJours: false,
    jours: JOURS_OUVRES as number[],
    morning: true,
    afternoon: false,
    mStart: '09:00',
    mEnd: '12:30',
    aStart: '14:00',
    aEnd: '17:30',
    price: '',
    groupeId: '',
  };
  const [form, setForm] = useState(initialForm);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const creneaux: Creneau[] = [
    ...(form.morning ? [{ debut: form.mStart, fin: form.mEnd, libelle: 'matin' }] : []),
    ...(form.afternoon ? [{ debut: form.aStart, fin: form.aEnd, libelle: 'après-midi' }] : []),
  ];

  // Aperçu calculé par la même fonction que le serveur : l'écran ne peut pas
  // annoncer un nombre de séances différent de celui qui sera créé.
  const plan =
    form.date && creneaux.length > 0
      ? genererSeances({
          dateDebut: form.date,
          dateFin: form.plusieursJours ? form.dateFin || form.date : form.date,
          jours: form.plusieursJours ? form.jours : [1, 2, 3, 4, 5, 6, 7],
          creneaux,
        })
      : null;
  const apercu = plan ? (plan.ok ? resumePlanification(plan.seances) : MESSAGES_PLANIFICATION[plan.erreur]) : null;

  function submit() {
    setError(null);
    if (!form.title.trim()) return setError('Intitulé requis');
    if (!form.date) return setError('Date requise');
    if (!plan) return setError('Choisissez au moins le matin ou l’après-midi.');
    if (!plan.ok) return setError(MESSAGES_PLANIFICATION[plan.erreur]);
    const priceCents = form.price.trim() ? parseEurosToCents(form.price) : null;
    if (form.price.trim() && priceCents == null) return setError('Tarif invalide (ex. 850 ou 850,50).');

    start(async () => {
      // Une journée unique est le cas simple de la série : un seul chemin de
      // création, donc un seul comportement à vérifier.
      const res = await creerSeancesEnSerie({
        dossierId,
        groupeId: form.groupeId || null,
        title: form.title,
        modality: form.modality,
        location: form.location,
        priceCents,
        dateDebut: form.date,
        dateFin: form.plusieursJours ? form.dateFin || form.date : form.date,
        jours: form.plusieursJours ? form.jours : [1, 2, 3, 4, 5, 6, 7],
        creneaux,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setForm(initialForm);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 hover:border-orange-300 hover:text-orange-700 dark:hover:border-orange-800 dark:hover:text-orange-300 transition"
      >
        <CalendarPlus className="w-4 h-4" /> Planifier une session
      </button>
    );
  }

  const isRemote = form.modality === 'distanciel' || form.modality === 'hybride';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Planifier une session</p>
      <FormField label="Intitulé" required>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Séance 1 — …" className={inputClass} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Du" required>
          <input
            type="date"
            value={form.date}
            onChange={(e) => {
              const d = e.target.value;
              // La fin suit le début tant qu'on ne l'a pas fixée : le cas
              // courant reste la journée unique.
              setForm((f) => ({ ...f, date: d, dateFin: !f.dateFin || f.dateFin < d ? d : f.dateFin }));
            }}
            className={inputClass}
          />
        </FormField>
        {form.plusieursJours && (
          <FormField label="Au" required>
            <input
              type="date"
              value={form.dateFin}
              min={form.date || undefined}
              onChange={(e) => set('dateFin', e.target.value)}
              className={inputClass}
            />
          </FormField>
        )}
      </div>

      {/* Case explicite plutôt qu'un affichage déduit d'une date de fin
          différente : le geste doit être visible avant d'être compris. */}
      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-3">
        <input
          type="checkbox"
          checked={form.plusieursJours}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              plusieursJours: e.target.checked,
              dateFin: e.target.checked ? f.dateFin || f.date : '',
            }))
          }
          className="w-4 h-4 accent-orange-500 mt-0.5"
        />
        <span>
          <span className="block text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
            Formation sur plusieurs jours
          </span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            Les horaires ci-dessous sont repris sur chaque jour coché. Une séance, son lien visio et ses feuilles
            d’émargement sont créés pour chacun.
          </span>
        </span>
      </label>

      {form.plusieursJours && (
        <div>
          <p className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Jours de formation</p>
          <div className="flex gap-1.5">
            {JOURS_SEMAINE.map((j) => {
              const actif = form.jours.includes(j.valeur);
              return (
                <button
                  key={j.valeur}
                  type="button"
                  title={j.long}
                  onClick={() =>
                    set(
                      'jours',
                      actif ? form.jours.filter((v) => v !== j.valeur) : [...form.jours, j.valeur].sort(),
                    )
                  }
                  className={`w-9 h-9 rounded-lg text-[13px] font-semibold transition ${
                    actif
                      ? 'bg-orange-500 text-white'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-orange-300'
                  }`}
                >
                  {j.court}
                </button>
              );
            })}
          </div>

        </div>
      )}
      {/* Le choix ne s'affiche que s'il se pose : sans groupe défini sur le
          dossier, une liste à un seul choix serait une question sans objet. */}
      {groupes.length > 0 && (
        <FormField
          label="Groupe concerné"
          hint="Seuls ses stagiaires seront attendus : participants, convocations et feuilles d’émargement."
        >
          <select value={form.groupeId} onChange={(e) => set('groupeId', e.target.value)} className={inputClass}>
            <option value="">Tout le dossier</option>
            {groupes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Tarif de la session (€ HT par stagiaire)">
        <input
          value={form.price}
          onChange={(e) => set('price', e.target.value)}
          inputMode="decimal"
          placeholder="Tarif catalogue de la formation"
          className={inputClass}
        />
      </FormField>

      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400">Demi-journée(s)</p>

        <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
            <input type="checkbox" checked={form.morning} onChange={(e) => set('morning', e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Matin
          </label>
          {form.morning && (
            <div className="grid grid-cols-2 gap-3 mt-2.5">
              <FormField label="Début"><input type="time" value={form.mStart} onChange={(e) => set('mStart', e.target.value)} className={inputClass} /></FormField>
              <FormField label="Fin"><input type="time" value={form.mEnd} onChange={(e) => set('mEnd', e.target.value)} className={inputClass} /></FormField>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
            <input type="checkbox" checked={form.afternoon} onChange={(e) => set('afternoon', e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Après-midi
          </label>
          {form.afternoon && (
            <div className="grid grid-cols-2 gap-3 mt-2.5">
              <FormField label="Début"><input type="time" value={form.aStart} onChange={(e) => set('aStart', e.target.value)} className={inputClass} /></FormField>
              <FormField label="Fin"><input type="time" value={form.aEnd} onChange={(e) => set('aEnd', e.target.value)} className={inputClass} /></FormField>
            </div>
          )}
        </div>

        {apercu && (
          <div className="text-[12px] bg-blue-50 dark:bg-blue-950/40 rounded-lg px-3 py-2">
            <p className="font-medium text-blue-700 dark:text-blue-300">{apercu}</p>
            {plan?.ok && (
              // Dire ce qui est créé en plus des séances : l'automatisme est
              // invisible sinon, et on le refait à la main par précaution.
              <p className="text-blue-600/90 dark:text-blue-400/90 mt-0.5">
                Feuilles d’émargement créées automatiquement
                {isRemote ? ' · un lien visio par séance' : ''}.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Modalité">
          <select value={form.modality} onChange={(e) => set('modality', e.target.value)} className={inputClass}>
            {MODALITIES.map((m) => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Lieu (si présentiel)">
          <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Salle…" className={inputClass} />
        </FormField>
      </div>
      {isRemote && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
          <Video className="w-3 h-3" /> Un lien Google Meet sera créé automatiquement et envoyé à l'apprenant.
        </p>
      )}
      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold px-4 h-9 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Créer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">Annuler</button>
      </div>
    </div>
  );
}

export function GenerateMeetButton({ sessionId, dossierId }: { sessionId: string; dossierId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await generateMeetForSession(sessionId, dossierId);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="h-6 px-2 rounded-md inline-flex items-center gap-1 text-[11px] font-bold bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
        Générer le lien Meet
      </button>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400" title={error}>échec</span>}
    </span>
  );
}
