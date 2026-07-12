'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2, Check, Users } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createFormationSession } from './group-session-actions';

const MODALITIES = [
  { v: 'presentiel', l: 'Présentiel' },
  { v: 'distanciel', l: 'Distanciel' },
  { v: 'hybride', l: 'Hybride' },
];

export function GroupSessionForm({ formationId }: { formationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialForm = {
    title: '',
    modality: 'presentiel',
    location: '',
    date: '',
    morning: true,
    afternoon: false,
    mStart: '09:00',
    mEnd: '12:30',
    aStart: '14:00',
    aEnd: '17:30',
  };
  const [form, setForm] = useState(initialForm);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    if (!form.title.trim()) return setError('Intitulé requis');
    if (!form.date) return setError('Date requise');
    if (!form.morning && !form.afternoon) return setError('Choisissez au moins le matin ou l’après-midi.');

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
        const res = await createFormationSession({
          formationId,
          title: both ? `${form.title} (${b.label})` : form.title,
          modality: form.modality,
          startsAt: new Date(`${form.date}T${b.start}`).toISOString(),
          endsAt: new Date(`${form.date}T${b.end}`).toISOString(),
          location: form.location,
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
        className="inline-flex items-center gap-2 text-[13px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
      >
        <CalendarPlus className="w-4 h-4" /> Planifier une session de groupe
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
        <Users className="w-4 h-4 text-violet-500" /> Session de groupe
      </p>
      <FormField label="Intitulé" required>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Séance 1 — …" className={inputClass} />
      </FormField>

      <FormField label="Date" required>
        <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputClass} />
      </FormField>

      <div className="space-y-2">
        <p className="text-[12px] font-medium text-zinc-600 dark:text-zinc-400">Demi-journée(s)</p>
        <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
            <input type="checkbox" checked={form.morning} onChange={(e) => set('morning', e.target.checked)} className="w-4 h-4 accent-violet-600" />
            Matin
          </label>
          {form.morning && (
            <div className="grid grid-cols-2 gap-3 mt-2.5">
              <FormField label="Début"><input type="time" value={form.mStart} onChange={(e) => set('mStart', e.target.value)} className={inputClass} /></FormField>
              <FormField label="Fin"><input type="time" value={form.mEnd} onChange={(e) => set('mEnd', e.target.value)} className={inputClass} /></FormField>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
            <input type="checkbox" checked={form.afternoon} onChange={(e) => set('afternoon', e.target.checked)} className="w-4 h-4 accent-violet-600" />
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

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Tous les apprenants de la formation seront rattachés automatiquement (émargement de groupe).
      </p>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-lg"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Créer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-zinc-500">Annuler</button>
      </div>
    </div>
  );
}
