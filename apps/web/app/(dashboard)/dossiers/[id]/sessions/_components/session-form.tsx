'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2, Video, Check } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createSession, generateMeetForSession } from '../session-actions';
import { parseEurosToCents } from '@/features/billing/domain/quote';

const MODALITIES = [
  { v: 'presentiel', l: 'Présentiel' },
  { v: 'distanciel', l: 'Distanciel' },
  { v: 'hybride', l: 'Hybride' },
];

export function SessionForm({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialForm = {
    title: '',
    modality: 'distanciel',
    location: '',
    date: '',
    morning: true,
    afternoon: false,
    mStart: '09:00',
    mEnd: '12:30',
    aStart: '14:00',
    aEnd: '17:30',
    price: '',
  };
  const [form, setForm] = useState(initialForm);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    if (!form.title.trim()) return setError('Intitulé requis');
    if (!form.date) return setError('Date requise');
    if (!form.morning && !form.afternoon) return setError('Choisissez au moins le matin ou l’après-midi.');
    const priceCents = form.price.trim() ? parseEurosToCents(form.price) : null;
    if (form.price.trim() && priceCents == null) return setError('Tarif invalide (ex. 850 ou 850,50).');

    // Une session par demi-journée sélectionnée (matin et/ou après-midi).
    const blocks: { label: string; start: string; end: string }[] = [];
    if (form.morning) blocks.push({ label: 'matin', start: form.mStart, end: form.mEnd });
    if (form.afternoon) blocks.push({ label: 'après-midi', start: form.aStart, end: form.aEnd });
    const both = blocks.length > 1;

    for (const b of blocks) {
      if (new Date(`${form.date}T${b.end}`) <= new Date(`${form.date}T${b.start}`)) {
        return setError(`Horaires du ${b.label} invalides (fin avant début).`);
      }
    }

    start(async () => {
      for (const b of blocks) {
        const res = await createSession({
          dossierId,
          title: both ? `${form.title} (${b.label})` : form.title,
          modality: form.modality,
          startsAt: new Date(`${form.date}T${b.start}`).toISOString(),
          endsAt: new Date(`${form.date}T${b.end}`).toISOString(),
          location: form.location,
          priceCents,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
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
      <FormField label="Date" required>
        <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputClass} />
      </FormField>
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

        {form.morning && form.afternoon && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Deux sessions seront créées : une le matin, une l’après-midi.</p>
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
