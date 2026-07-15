'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Building2 } from 'lucide-react';
import { updateOrgIdentityAction } from './identity-actions';

type IdentityProps = {
  name: string;
  legalName: string;
  siret: string;
  declarationActivite: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressPostalCode: string;
  addressCity: string;
  representativeName: string;
  representativeTitle: string;
};

const inputCls =
  'mt-1 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px]';
const labelCls = 'text-[13px] text-zinc-700 dark:text-zinc-300';

export function IdentitySection(props: { org: IdentityProps }) {
  const [form, setForm] = useState<IdentityProps>(props.org);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateIdentity = useAction(updateOrgIdentityAction);

  const set =
    (key: keyof IdentityProps) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await updateIdentity.executeAsync({
        name: form.name,
        legalName: form.legalName,
        siret: form.siret,
        declarationActivite: form.declarationActivite,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        address: {
          line1: form.addressLine1,
          postalCode: form.addressPostalCode,
          city: form.addressCity,
        },
        representativeName: form.representativeName,
        representativeTitle: form.representativeTitle,
      });
      const out = res?.data;
      if (out?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else if (res?.validationErrors) {
        setError('Champs invalides.');
      } else if (out?.error === 'forbidden') {
        setError(
          "Vous devez être administrateur ou propriétaire de l’organisme pour modifier ces informations. Demandez à un administrateur de vous attribuer ce rôle.",
        );
      } else if (out?.error === 'organization_not_found') {
        setError('Organisation introuvable pour votre compte.');
      } else if (out?.error === 'db_error') {
        setError(`Erreur d’enregistrement : ${out.details ?? 'erreur base de données'}`);
      } else {
        setError('Échec de l’enregistrement.');
      }
    });

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-violet-500" />
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Identité légale</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Nom commercial
          <input value={form.name} onChange={set('name')} className={inputCls} />
        </label>
        <label className={labelCls}>
          Raison sociale
          <input value={form.legalName} onChange={set('legalName')} className={inputCls} />
        </label>
        <label className={labelCls}>
          SIRET
          <input value={form.siret} onChange={set('siret')} maxLength={14} className={`${inputCls} font-mono`} />
        </label>
        <label className={labelCls}>
          Déclaration d’activité
          <input
            value={form.declarationActivite}
            onChange={set('declarationActivite')}
            className={`${inputCls} font-mono`}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Email de contact
          <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className={inputCls} />
        </label>
        <label className={labelCls}>
          Téléphone
          <input value={form.contactPhone} onChange={set('contactPhone')} className={inputCls} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className={`${labelCls} col-span-3 sm:col-span-1`}>
          Adresse
          <input value={form.addressLine1} onChange={set('addressLine1')} className={inputCls} placeholder="N° et rue" />
        </label>
        <label className={labelCls}>
          Code postal
          <input value={form.addressPostalCode} onChange={set('addressPostalCode')} className={inputCls} />
        </label>
        <label className={labelCls}>
          Ville
          <input value={form.addressCity} onChange={set('addressCity')} className={inputCls} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Nom du représentant
          <input value={form.representativeName} onChange={set('representativeName')} className={inputCls} />
        </label>
        <label className={labelCls}>
          Qualité du représentant
          <input value={form.representativeTitle} onChange={set('representativeTitle')} className={inputCls} />
        </label>
      </div>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
      >
        {saved ? 'Enregistré' : 'Enregistrer l’identité'}
      </button>
    </section>
  );
}
