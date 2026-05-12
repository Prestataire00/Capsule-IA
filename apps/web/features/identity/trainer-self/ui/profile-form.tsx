'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { z } from 'zod';
import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { TrainerProfilePatchSchema } from './schemas';
import { updateProfileAction } from '@/app/(formateur)/profil/actions';
import type { TrainerMembership } from '../application/ports';

const FormSchema = TrainerProfilePatchSchema.required({ firstName: true, lastName: true });
type FormValues = z.infer<typeof FormSchema>;

export function ProfileForm({
  memberships,
  initial,
  activeTrainerIds,
}: {
  memberships: TrainerMembership[];
  initial: FormValues & {
    email: string;
    isInternal: boolean;
    siret: string | null;
    hourlyRateCents: number | null;
  };
  activeTrainerIds: string[];
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  const action = useAction(updateProfileAction);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initial,
  });

  const onSubmit = (data: FormValues) => {
    const trainerIds = applyToAll
      ? memberships.map((m) => m.trainerId as string)
      : activeTrainerIds;
    action.execute({ trainerIds, patch: data });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Prénom" required>
          <input className={inputClass} {...register('firstName')} />
        </FormField>
        <FormField label="Nom" required>
          <input className={inputClass} {...register('lastName')} />
        </FormField>
      </div>

      <FormField label="Email" hint="Modifiable uniquement par l'admin de l'OF">
        <input className={inputClass + ' opacity-60 cursor-not-allowed'} value={initial.email} disabled />
      </FormField>

      <FormField label="Téléphone">
        <input className={inputClass} {...register('phone')} placeholder="+33 6 12 34 56 78" />
      </FormField>

      <FormField label="Bio" hint="Max 2000 caractères">
        <textarea className={inputClass + ' min-h-[100px]'} {...register('bio')} maxLength={2000} />
      </FormField>

      <FormField label="Spécialités" hint="12 max — séparées par virgule">
        <input
          className={inputClass}
          placeholder="qualiopi, anglais, vente"
          defaultValue={initial.specialties?.join(', ') ?? ''}
          {...register('specialties', {
            setValueAs: (v: string | string[]) =>
              typeof v === 'string'
                ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12)
                : v,
          })}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="SIRET" hint="Modifiable uniquement par l'admin de l'OF">
          <input
            className={inputClass + ' opacity-60 cursor-not-allowed'}
            value={initial.siret ?? '—'}
            disabled
          />
        </FormField>
        <FormField label="Taux horaire" hint="Modifiable uniquement par l'admin de l'OF">
          <input
            className={inputClass + ' opacity-60 cursor-not-allowed'}
            value={
              initial.hourlyRateCents == null
                ? '—'
                : `${(initial.hourlyRateCents / 100).toFixed(2)} €/h`
            }
            disabled
          />
        </FormField>
      </div>

      <FormField
        label={initial.isInternal ? 'Type — Interne' : 'Type — Externe (freelance)'}
        hint="Modifiable uniquement par l'admin de l'OF"
      >
        <span className="text-[11px] text-zinc-400">
          {initial.isInternal ? 'Salarié(e) de l\'OF' : 'Prestataire externe'}
        </span>
      </FormField>

      {memberships.length > 1 && (
        <label className="flex items-start gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Appliquer ces modifications à mes <strong>{memberships.length}</strong> organismes
            (sinon seulement l&apos;OF actif)
          </span>
        </label>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={action.isExecuting || !formState.isDirty}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm transition"
        >
          {action.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        {action.result?.data?.ok && (
          <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Enregistré ✓</span>
        )}
        {action.result?.serverError && (
          <span className="text-[12px] text-red-600 dark:text-red-400">{String(action.result.serverError)}</span>
        )}
      </div>
    </form>
  );
}
