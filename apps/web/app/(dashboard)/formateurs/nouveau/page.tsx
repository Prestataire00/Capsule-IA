// ARCHETYPE: workflow
import Link from 'next/link';
import { ArrowLeft, Check, UserCog, Mail, Phone, Briefcase, Tag } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

export default function NouveauFormateurPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/formateurs"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux formateurs
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-sm">
            <UserCog className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouveau formateur
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez un formateur (interne ou externe) à votre réseau.
            </p>
          </div>
        </header>

        <form action="/formateurs" method="get" className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Identité</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Prénom" required>
                <input type="text" name="firstName" required placeholder="Marc" className={inputClass} />
              </FormField>
              <FormField label="Nom" required>
                <input type="text" name="lastName" required placeholder="Dupont" className={inputClass} />
              </FormField>
            </div>
            <FormField label="Email" required>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="email" name="email" required placeholder="marc@acme-of.fr" className={`${inputClass} pl-9`} />
              </div>
            </FormField>
            <FormField label="Téléphone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="tel" name="phone" placeholder="06 12 34 56 78" className={`${inputClass} pl-9`} />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Statut</p>
            <FormField label="Type" required>
              <div className="grid grid-cols-2 gap-2">
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="kind" value="internal" defaultChecked className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Interne</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Salarié de l'OF</p>
                </label>
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="kind" value="external" className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Externe</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Freelance / sous-traitant</p>
                </label>
              </div>
            </FormField>
            <FormField label="SIRET (si externe)" hint="14 chiffres — laisser vide si interne.">
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="siret"
                  pattern="[0-9]{14}"
                  placeholder="12345678900012"
                  className={`${inputClass} pl-9 font-mono`}
                />
              </div>
            </FormField>
            <FormField label="Tarif horaire">
              <div className="relative">
                <input
                  type="number"
                  name="hourlyRate"
                  placeholder="80"
                  className={`${inputClass} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">€</span>
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Spécialités</p>
            <FormField label="Domaines d'expertise" hint="Séparez par des virgules.">
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="specialties"
                  placeholder="Comptabilité, Fiscalité, Excel"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </FormField>
            <FormField label="Bio">
              <textarea
                name="bio"
                rows={3}
                placeholder="20 ans d'expérience comptable en cabinet…"
                className={inputClass}
              />
            </FormField>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/formateurs" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Créer le formateur
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
