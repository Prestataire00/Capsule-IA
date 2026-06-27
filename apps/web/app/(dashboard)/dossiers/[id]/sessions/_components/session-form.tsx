'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2, Video, Check } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createSession, generateMeetForSession } from '../session-actions';

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
  const [form, setForm] = useState({
    title: '',
    modality: 'distanciel',
    startsAt: '',
    endsAt: '',
    location: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    start(async () => {
      const res = await createSession({
        dossierId,
        title: form.title,
        modality: form.modality,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
        location: form.location,
      });
      if (res.ok) {
        setOpen(false);
        setForm({ title: '', modality: 'distanciel', startsAt: '', endsAt: '', location: '' });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-[13px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
      >
        <CalendarPlus className="w-4 h-4" /> Planifier une session
      </button>
    );
  }

  const isRemote = form.modality === 'distanciel' || form.modality === 'hybride';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Planifier une session</p>
      <FormField label="Intitulé" required>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Séance 1 — …" className={inputClass} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Début" required>
          <input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Fin" required>
          <input type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} className={inputClass} />
        </FormField>
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
        <p className="text-[11px] text-zinc-500 inline-flex items-center gap-1">
          <Video className="w-3 h-3" /> Un lien Google Meet sera créé automatiquement et envoyé à l'apprenant.
        </p>
      )}
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
        className="inline-flex items-center gap-1 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
        Générer le lien Meet
      </button>
      {error && <span className="text-[11px] text-red-600" title={error}>échec</span>}
    </span>
  );
}
