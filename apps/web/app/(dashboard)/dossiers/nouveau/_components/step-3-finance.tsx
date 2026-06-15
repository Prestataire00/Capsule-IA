// ARCHETYPE: workflow (sous-écran step 3)
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { funders } from '@/shared/mock/data';
import { InfoCallout } from '@/shared/ui/info-callout';

export function Step3Finance() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Financement</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Indiquez le montant et le ou les financeur(s). Tu pourras émettre la facture après la clôture.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Montant total HT *">
          <div className="flex items-center gap-2">
            <input
              type="number"
              defaultValue={3500}
              className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
            />
            <span className="text-[13px] text-zinc-500">€</span>
          </div>
        </Field>

        <Field label="Financeur principal *">
          <select
            defaultValue={funders[0]?.id}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
          >
            {funders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Numéro de prise en charge (optionnel)">
          <input
            type="text"
            placeholder="ex : 2026-OPCO-12345"
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </Field>
      </div>

      <InfoCallout tone="info">
        <p className="font-medium">Que se passe-t-il à la création ?</p>
        <ul className="mt-1 space-y-0.5 text-[11px]">
          <li>· Le dossier est créé en statut <code className="font-mono">draft</code></li>
          <li>· La convention, la convocation et le programme sont générés automatiquement</li>
          <li>· Le questionnaire de positionnement est envoyé à l'apprenant</li>
          <li>· La checklist Qualiopi est initialisée pour ce dossier</li>
        </ul>
      </InfoCallout>

      <div className="flex items-center justify-between pt-4">
        <Link
          href="/dossiers/nouveau?step=2"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Précédent
        </Link>
        <Link
          href="/dossiers"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Check className="w-3.5 h-3.5" />
          Créer le dossier
        </Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 block mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}
