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
  certifications: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressPostalCode: string;
  addressCity: string;
  representativeName: string;
  representativeTitle: string;
  vatRegime: 'exempt' | 'subject';
  defaultVatRate: string;
  vatOnDebits: boolean;
};

const inputCls =
  'mt-1.5 w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition placeholder:text-zinc-400';
const labelCls = 'text-[12px] font-semibold text-zinc-700 dark:text-zinc-300';

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom commercial',
  legalName: 'Raison sociale',
  siret: 'SIRET',
  declarationActivite: 'Déclaration d’activité',
  certifications: 'Agréments',
  contactEmail: 'Email de contact',
  contactPhone: 'Téléphone',
  address: 'Adresse',
  representativeName: 'Nom du représentant',
  representativeTitle: 'Qualité du représentant',
  vatRegime: 'Régime de TVA',
  defaultVatRate: 'Taux de TVA',
  vatOnDebits: 'Option pour les débits',
};

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
        certifications: form.certifications,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        address: {
          line1: form.addressLine1,
          postalCode: form.addressPostalCode,
          city: form.addressCity,
        },
        representativeName: form.representativeName,
        representativeTitle: form.representativeTitle,
        vatRegime: form.vatRegime,
        defaultVatRate: Number(form.defaultVatRate) || 0,
        vatOnDebits: form.vatOnDebits,
      });
      const out = res?.data;
      if (out?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else if (res?.validationErrors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ve = res.validationErrors as any;
        const invalid = Object.keys(ve)
          .filter((k) => k !== '_errors' && ve[k])
          .map((k) => FIELD_LABELS[k] ?? k);
        setError(
          invalid.length
            ? `À corriger : ${invalid.join(', ')}. (SIRET ≤ 14 caractères sans espaces ; email au bon format ; nom commercial requis.)`
            : 'Champs invalides.',
        );
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
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Identité légale</h2>
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

      <label className={labelCls}>
        Agréments et habilitations
        <input
          value={form.certifications}
          onChange={set('certifications')}
          className={inputCls}
          placeholder="CNAPS : FOR-000-0000-00-00-00000000000"
        />
        <span className="block mt-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
          Affichés sur tous les documents, à la suite du SIRET et de la déclaration d’activité.
        </span>
      </label>

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

      <div className="border-t border-zinc-200/70 dark:border-zinc-800 pt-4 space-y-3">
        <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">TVA</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Régime
            <select
              value={form.vatRegime}
              onChange={(e) =>
                setForm((f) => ({ ...f, vatRegime: e.target.value as IdentityProps['vatRegime'] }))
              }
              className={inputCls}
            >
              <option value="exempt">Exonéré (art. 261-4-4°a CGI)</option>
              <option value="subject">Assujetti</option>
            </select>
          </label>
          <label className={labelCls}>
            Taux par défaut (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.defaultVatRate}
              onChange={set('defaultVatRate')}
              disabled={form.vatRegime === 'exempt'}
              className={`${inputCls} tabular-nums disabled:opacity-50`}
            />
          </label>
        </div>
        <label className="flex items-start gap-2.5 text-[13px] text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={form.vatOnDebits}
            disabled={form.vatRegime === 'exempt'}
            onChange={(e) => setForm((f) => ({ ...f, vatOnDebits: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500 disabled:opacity-50"
          />
          <span>
            J’ai opté pour le paiement de la TVA <strong className="font-semibold">d’après les débits</strong>
            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
              La taxe devient exigible à la facturation, et non à l’encaissement. La mention devient
              alors obligatoire sur chaque facture — c’est l’une des quatre exigées par la
              facturation électronique.
            </span>
          </span>
        </label>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Ce réglage pré-remplit le taux des nouvelles factures et sert de référence aux tarifs du
          catalogue. La formation professionnelle continue est exonérée de TVA sous réserve de
          l’attestation fiscale — vérifiez votre situation avant de passer en « assujetti ».
        </p>
      </div>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-9 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition disabled:opacity-50"
      >
        {saved ? 'Enregistré' : 'Enregistrer l’identité'}
      </button>
    </section>
  );
}
