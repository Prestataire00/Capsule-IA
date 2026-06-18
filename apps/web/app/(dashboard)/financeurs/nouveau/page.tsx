// ARCHETYPE: workflow
import Link from 'next/link';
import { ArrowLeft, Check, Wallet, Mail, Hash } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { requireAccess } from '@/shared/lib/auth/require-access';

const KINDS = [
  { value: 'opco', label: 'OPCO', hint: 'Organisme paritaire' },
  { value: 'cpf', label: 'CPF', hint: 'Compte personnel de formation' },
  { value: 'pole_emploi', label: 'France Travail', hint: 'Ex-Pôle emploi' },
  { value: 'region', label: 'Région', hint: 'Conseil régional' },
  { value: 'entreprise', label: 'Entreprise', hint: 'Plan de développement' },
  { value: 'autofinancement', label: 'Autofinancement', hint: 'L’apprenant paie' },
] as const;

export default async function NouveauFinanceurPage() {
  await requireAccess('catalogue', 'manage');
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/financeurs"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux financeurs
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-sm">
            <Wallet className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouveau financeur
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez un financeur pour le rattacher à vos dossiers.
            </p>
          </div>
        </header>

        <form action="/financeurs" method="get" className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Identité</p>
            <FormField label="Nom" required>
              <input type="text" name="name" required placeholder="OPCO Atlas" className={inputClass} />
            </FormField>
            <FormField label="Email de contact">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="email" name="email" placeholder="contact@opco-atlas.fr" className={`${inputClass} pl-9`} />
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
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Type de financeur</p>
            <FormField label="Catégorie" required>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map((k, i) => (
                  <label
                    key={k.value}
                    className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.value}
                      defaultChecked={i === 0}
                      className="sr-only"
                    />
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{k.label}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{k.hint}</p>
                  </label>
                ))}
              </div>
            </FormField>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/financeurs" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Créer le financeur
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
