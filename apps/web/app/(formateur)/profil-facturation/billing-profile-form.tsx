'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Save } from 'lucide-react';
import { saveBillingProfile } from './actions';

type Champs = {
  legalName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  siret: string;
  vatRegime: 'franchise' | 'assujetti';
  vatRate: string;
  vatNumber: string;
  iban: string;
  bic: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
};

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

function Champ({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {aide && <span className="block text-[11px] text-zinc-500">{aide}</span>}
    </label>
  );
}

export function BillingProfileForm({ initial, numerotationLibre }: { initial: Champs; numerotationLibre: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Champs>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const maj = (k: keyof Champs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setOk(false);
    setF((x) => ({ ...x, [k]: e.target.value }));
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        start(async () => {
          const r = await saveBillingProfile({
            ...f,
            vatRate: Number(f.vatRate.replace(',', '.')),
            nextInvoiceNumber: Number(f.nextInvoiceNumber),
          });
          if (r.ok) {
            setOk(true);
            router.refresh();
          } else setErreur(r.error);
        });
      }}
    >
      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
        <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Identité</h2>
        <Champ label="Nom ou raison sociale" aide="Tel qu’il doit figurer sur vos factures (ex. « Anissa Fiévé EI »).">
          <input value={f.legalName} onChange={maj('legalName')} className={champ} maxLength={200} required />
        </Champ>
        <Champ label="Adresse">
          <input value={f.addressLine} onChange={maj('addressLine')} className={champ} maxLength={300} required />
        </Champ>
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Champ label="Code postal">
            <input value={f.postalCode} onChange={maj('postalCode')} className={champ} maxLength={10} required />
          </Champ>
          <Champ label="Ville">
            <input value={f.city} onChange={maj('city')} className={champ} maxLength={120} required />
          </Champ>
        </div>
        <Champ label="SIRET">
          <input value={f.siret} onChange={maj('siret')} className={`${champ} tabular-nums`} maxLength={17} required inputMode="numeric" />
        </Champ>
      </section>

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
        <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">TVA</h2>
        <Champ label="Régime">
          <select value={f.vatRegime} onChange={maj('vatRegime')} className={champ}>
            <option value="franchise">Franchise en base (micro-entreprise) — « TVA non applicable, art. 293 B du CGI »</option>
            <option value="assujetti">Assujetti à la TVA</option>
          </select>
        </Champ>
        {f.vatRegime === 'assujetti' && (
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Champ label="Taux (%)">
              <input value={f.vatRate} onChange={maj('vatRate')} className={`${champ} tabular-nums`} inputMode="decimal" />
            </Champ>
            <Champ label="N° de TVA intracommunautaire">
              <input value={f.vatNumber} onChange={maj('vatNumber')} className={champ} maxLength={30} />
            </Champ>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
        <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Règlement et numérotation</h2>
        <div className="grid sm:grid-cols-[1fr_140px] gap-3">
          <Champ label="IBAN" aide="Facultatif : imprimé sur la facture pour faciliter le virement.">
            <input value={f.iban} onChange={maj('iban')} className={`${champ} font-mono`} maxLength={42} />
          </Champ>
          <Champ label="BIC">
            <input value={f.bic} onChange={maj('bic')} className={`${champ} font-mono`} maxLength={11} />
          </Champ>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Préfixe des factures" aide="Ex. FAC → FAC-2026-0001">
            <input value={f.invoicePrefix} onChange={maj('invoicePrefix')} className={`${champ} font-mono`} maxLength={10} />
          </Champ>
          <Champ
            label="Prochain numéro"
            aide={numerotationLibre ? 'Pour reprendre votre numérotation actuelle.' : 'La suite de vos factures reste continue.'}
          >
            <input
              value={f.nextInvoiceNumber}
              onChange={maj('nextInvoiceNumber')}
              className={`${champ} tabular-nums`}
              inputMode="numeric"
              disabled={!numerotationLibre}
            />
          </Champ>
        </div>
      </section>

      {erreur && (
        <p role="alert" className="text-[13px] text-red-700 dark:text-red-300">
          {erreur}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm disabled:opacity-40"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
        {ok && (
          <span role="status" className="text-[12px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Profil enregistré
          </span>
        )}
      </div>
    </form>
  );
}
