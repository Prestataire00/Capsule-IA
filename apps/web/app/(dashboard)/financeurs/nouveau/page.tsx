// ARCHETYPE: workflow
import Link from 'next/link';
import { ArrowLeft, Check, Mail, Hash } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { SectionLabel } from '@/shared/ui/section-label';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { createFunder } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'Le nom du financeur est requis.',
  no_kind: 'Sélectionnez au moins un type de financeur.',
};

const KINDS = [
  { value: 'opco', label: 'OPCO', hint: 'Organisme paritaire' },
  { value: 'cpf', label: 'CPF', hint: 'Compte personnel de formation' },
  { value: 'pole_emploi', label: 'France Travail', hint: 'Ex-Pôle emploi' },
  { value: 'region', label: 'Région', hint: 'Conseil régional' },
  { value: 'entreprise', label: 'Entreprise', hint: 'Plan de développement' },
  { value: 'autofinancement', label: 'Autofinancement', hint: 'L’apprenant paie' },
] as const;

export default async function NouveauFinanceurPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireAccess('catalogue', 'manage');
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/financeurs"
          className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux financeurs
        </Link>

        {searchParams.error && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px]">
            {ERROR_MESSAGES[searchParams.error] ?? 'Une erreur est survenue lors de la création.'}
          </div>
        )}

        <header className="mb-8">
          <SectionLabel className="mb-2">Financeurs</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouveau financeur</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">Ajoutez un financeur pour le rattacher à vos dossiers.</p>
        </header>

        <form action={createFunder} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Identité</p>
            <FormField label="Nom" required>
              <input type="text" name="name" required placeholder="OPCO Atlas" className={inputClass} />
            </FormField>
            <FormField label="Email de contact">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="email" name="email" placeholder="contact@opco-atlas.fr" className={`${inputClass} pl-9`} />
              </div>
            </FormField>
            <FormField
              label="SIRET"
              hint="Son SIREN — les 9 premiers chiffres — est une mention obligatoire de la facture électronique."
            >
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="siret"
                  inputMode="numeric"
                  placeholder="123 456 789 00012"
                  className={`${inputClass} pl-9 tabular-nums`}
                />
              </div>
            </FormField>
            <FormField label="Identifiant externe" hint="Code ou référence dans le système du financeur.">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="externalId"
                  placeholder="ATLAS-2026-001"
                  className={`${inputClass} pl-9 font-mono`}
                />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Type de financeur</p>
            <FormField label="Catégorie(s)" required hint="Plusieurs types possibles pour un même financeur.">
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map((k, i) => (
                  <label
                    key={k.value}
                    className="flex items-start gap-2.5 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-orange-50 dark:has-[:checked]:bg-orange-950/40 has-[:checked]:border-orange-300 dark:has-[:checked]:border-orange-800 transition"
                  >
                    <input
                      type="checkbox"
                      name="kind"
                      value={k.value}
                      defaultChecked={i === 0}
                      className="mt-0.5 accent-orange-500"
                    />
                    <span className="min-w-0">
                      <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block">{k.label}</span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">{k.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/financeurs" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Créer le financeur
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
