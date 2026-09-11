'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Send } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { TARIF_BASES } from '@/features/trainer-space/billing-rules';
import { updateTrainerIdentity, resendTrainerInvite } from './profile-actions';

export type TrainerIdentity = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isInternal: boolean;
  siret: string;
  nda: string;
  zoomUrl: string;
  specialties: string[];
  tarifBase: '' | 'heure' | 'jour' | 'session';
  tarifEuros: string;
};

/** Édition complète de la fiche formateur + renvoi de l'invitation à son espace. */
export function TrainerIdentityEdit({
  trainerId,
  initial,
}: {
  trainerId: string;
  initial: TrainerIdentity;
}) {
  const router = useRouter();
  const [form, setForm] = useState<TrainerIdentity>(initial);
  const [specialtiesRaw, setSpecialtiesRaw] = useState(initial.specialties.join(', '));
  const [saving, startSave] = useTransition();
  const [inviting, startInvite] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const set =
    (key: keyof TrainerIdentity) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const save = () => {
    setError(null);
    setSaved(false);
    startSave(async () => {
      const res = await updateTrainerIdentity(trainerId, {
        ...form,
        specialties: specialtiesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const resend = () => {
    setInviteMsg(null);
    startInvite(async () => {
      const res = await resendTrainerInvite(trainerId);
      setInviteMsg(res.ok ? 'Invitation envoyée.' : res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Prénom" required>
          <input value={form.firstName} onChange={set('firstName')} className={inputClass} maxLength={100} />
        </FormField>
        <FormField label="Nom" required>
          <input value={form.lastName} onChange={set('lastName')} className={inputClass} maxLength={100} />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="E-mail" hint="Sert de clé d'accès à son espace formateur">
          <input value={form.email} onChange={set('email')} className={inputClass} maxLength={255} />
        </FormField>
        <FormField label="Téléphone">
          <input value={form.phone} onChange={set('phone')} className={inputClass} maxLength={30} />
        </FormField>
      </div>

      <FormField label="Type">
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-zinc-700 dark:text-zinc-300">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={form.isInternal}
              onChange={() => {
                setSaved(false);
                setForm((f) => ({ ...f, isInternal: true }));
              }}
            />
            Interne
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={!form.isInternal}
              onChange={() => {
                setSaved(false);
                setForm((f) => ({ ...f, isInternal: false }));
              }}
            />
            Externe (freelance)
          </label>
        </div>
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="SIRET" hint="14 chiffres — formateur externe">
          <input value={form.siret} onChange={set('siret')} className={`${inputClass} font-mono`} maxLength={17} />
        </FormField>
        <FormField label="NDA" hint="N° de déclaration d'activité (sous-traitant)">
          <input value={form.nda} onChange={set('nda')} className={inputClass} maxLength={50} />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Tarif HT (€)" hint="Ce que le formateur coûte à l’organisme ; ses factures se calculent dessus">
          <input
            value={form.tarifEuros}
            onChange={set('tarifEuros')}
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            placeholder="Ex. 45 ou 350,50"
            maxLength={12}
          />
        </FormField>
        <FormField label="Base de facturation">
          <select
            value={form.tarifBase}
            onChange={(e) => {
              setSaved(false);
              setForm((f) => ({ ...f, tarifBase: e.target.value as TrainerIdentity['tarifBase'] }));
            }}
            className={inputClass}
          >
            <option value="">— Non renseignée —</option>
            {TARIF_BASES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Lien Zoom personnel">
        <input value={form.zoomUrl} onChange={set('zoomUrl')} className={inputClass} maxLength={500} placeholder="https://zoom.us/j/…" />
      </FormField>

      <FormField label="Spécialités" hint="Séparées par virgule, max 12">
        <input
          value={specialtiesRaw}
          onChange={(e) => {
            setSaved(false);
            setSpecialtiesRaw(e.target.value);
          }}
          className={inputClass}
          placeholder="qualiopi, anglais, vente"
        />
      </FormField>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-3.5 py-1.5 rounded-md shadow-sm transition"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
        {saved && <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Enregistré.</span>}

        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />

        <button
          type="button"
          onClick={resend}
          disabled={inviting}
          className="inline-flex items-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 disabled:opacity-50 transition"
        >
          {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Renvoyer l’invitation
        </button>
        {inviteMsg && <span className="text-[12px] text-zinc-600 dark:text-zinc-400">{inviteMsg}</span>}
      </div>
    </div>
  );
}
