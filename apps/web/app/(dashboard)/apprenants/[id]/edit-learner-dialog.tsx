'use client';

import { useState, useTransition } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { updateLearner } from './actions';
import type { UpdateLearnerInput } from './schema';

type Props = {
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    position: string | null;
    statut: string | null;
    rqth: boolean;
    accessibility_notes: string | null;
  };
};

export function EditLearnerDialog({ learner }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input: UpdateLearnerInput = {
      learnerId: learner.id,
      firstName: String(fd.get('firstName') ?? ''),
      lastName: String(fd.get('lastName') ?? ''),
      email: String(fd.get('email') ?? ''),
      phone: (String(fd.get('phone') ?? '').trim() || null),
      position: (String(fd.get('position') ?? '').trim() || null),
      statut: (fd.get('statut') ? (String(fd.get('statut')) as UpdateLearnerInput['statut']) : null),
      rqth: fd.get('rqth') === 'on',
      accessibilityNotes: (String(fd.get('accessibilityNotes') ?? '').trim() || null),
    };
    startTransition(async () => {
      const res = await updateLearner(input);
      const data = res?.data;
      if (data?.ok) {
        setOpen(false);
        window.location.reload();
      } else {
        setError(data && !data.ok ? data.error : "Echec de l'enregistrement.");
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] text-zinc-600 dark:text-zinc-300 hover:underline inline-flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" /> Modifier
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Prénom" required>
          <input name="firstName" defaultValue={learner.first_name} className={inputClass} />
        </FormField>
        <FormField label="Nom" required>
          <input name="lastName" defaultValue={learner.last_name} className={inputClass} />
        </FormField>
        <FormField label="Email">
          <input name="email" type="email" defaultValue={learner.email ?? ''} className={inputClass} />
        </FormField>
        <FormField label="Téléphone">
          <input name="phone" defaultValue={learner.phone ?? ''} className={inputClass} />
        </FormField>
        <FormField label="Poste / fonction">
          <input name="position" defaultValue={learner.position ?? ''} className={inputClass} />
        </FormField>
        <FormField label="Statut">
          <select name="statut" defaultValue={learner.statut ?? ''} className={inputClass}>
            <option value="">—</option>
            <option value="salarie">Salarié</option>
            <option value="dirigeant">Dirigeant</option>
            <option value="independant">Indépendant</option>
          </select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" name="rqth" defaultChecked={learner.rqth} /> RQTH
      </label>
      <FormField label="Notes d'accessibilité">
        <textarea name="accessibilityNotes" defaultValue={learner.accessibility_notes ?? ''} rows={3} className={inputClass} />
      </FormField>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending} variant="primary">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </Button>
        <Button type="button" onClick={() => setOpen(false)} variant="secondary" disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
