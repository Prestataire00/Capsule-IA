'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { z } from 'zod';
import { useRef, useState } from 'react';
import { Camera, Loader2, Save, Trash2 } from 'lucide-react';
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
    avatarUrl: string | null;
  };
  activeTrainerIds: string[];
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(initial.avatarPath ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const action = useAction(updateProfileAction);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initial,
  });

  const onSubmit = (data: FormValues) => {
    const trainerIds = applyToAll
      ? memberships.map((m) => m.trainerId as string)
      : activeTrainerIds;
    action.execute({ trainerIds, patch: { ...data, avatarPath } });
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet re-upload du même fichier
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image trop lourde (5 Mo max)');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setAvatarError('Format non supporté (PNG, JPG, WebP)');
      return;
    }
    setAvatarUploading(true);
    setAvatarError(null);

    // Preview local immédiat
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);

    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/profil/api/avatar/upload', { method: 'POST', body: fd });
    const body = (await res.json()) as
      | { ok: true; path: string; publicUrl: string }
      | { ok: false; error: string };
    setAvatarUploading(false);

    if (!body.ok) {
      setAvatarError(body.error);
      URL.revokeObjectURL(localUrl);
      setAvatarPreview(initial.avatarUrl);
      return;
    }
    setAvatarPath(body.path);
    setAvatarPreview(body.publicUrl);
  };

  const onAvatarRemove = () => {
    setAvatarPath(null);
    setAvatarPreview(null);
    setAvatarError(null);
  };

  const initials = `${initial.firstName?.[0] ?? ''}${initial.lastName?.[0] ?? ''}`.toUpperCase();
  const avatarDirty =
    avatarPath !== (initial.avatarPath ?? null) ||
    (avatarPreview === null && initial.avatarUrl !== null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={avatarUploading}
          className="group relative w-20 h-20 rounded-full overflow-hidden border border-zinc-200/60 dark:border-zinc-800 bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/50 dark:to-rose-950/30 flex items-center justify-center shadow-sm hover:shadow-md transition disabled:opacity-50"
          aria-label="Changer l'avatar"
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[20px] font-medium text-orange-700 dark:text-orange-300">
              {initials || '👤'}
            </span>
          )}
          <span className="absolute inset-0 bg-zinc-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            {avatarUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Camera className="w-4 h-4 text-white" />
            )}
          </span>
        </button>

        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Photo de profil</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">PNG, JPG ou WebP — 5 Mo max</p>
          {avatarPreview && (
            <button
              type="button"
              onClick={onAvatarRemove}
              className="text-[11px] text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              <Trash2 className="w-3 h-3" /> Retirer
            </button>
          )}
          {avatarError && (
            <p className="text-[11px] text-red-600 dark:text-red-400">{avatarError}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onAvatarChange}
        />
      </div>

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
          disabled={action.isExecuting || avatarUploading || (!formState.isDirty && !avatarDirty)}
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
