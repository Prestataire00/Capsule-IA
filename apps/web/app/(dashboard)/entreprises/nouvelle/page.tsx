// ARCHETYPE: workflow
import Link from 'next/link';
import { ArrowLeft, Check, Building2, Mail, Phone, MapPin, Hash } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

export default function NouvelleEntreprisePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/entreprises"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux entreprises
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/60 dark:to-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouvelle entreprise
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez une entreprise cliente à votre carnet.
            </p>
          </div>
        </header>

        <form action="/entreprises" method="get" className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Identification</p>
            <FormField label="Nom commercial" required>
              <input type="text" name="name" required placeholder="Acme Conseil" className={inputClass} />
            </FormField>
            <FormField label="Raison sociale" hint="Laissez vide si identique au nom commercial.">
              <input type="text" name="legalName" placeholder="ACME CONSEIL SAS" className={inputClass} />
            </FormField>
            <FormField label="SIRET" required hint="14 chiffres, sans espaces.">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="siret"
                  required
                  pattern="[0-9]{14}"
                  placeholder="12345678900012"
                  className={`${inputClass} pl-9 font-mono`}
                />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Contact</p>
            <FormField label="Email" required>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="email" name="email" required placeholder="contact@acme.fr" className={`${inputClass} pl-9`} />
              </div>
            </FormField>
            <FormField label="Téléphone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="tel" name="phone" placeholder="01 23 45 67 89" className={`${inputClass} pl-9`} />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Adresse</p>
            <FormField label="Adresse">
              <input type="text" name="address" placeholder="12 rue de la République" className={inputClass} />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Code postal" className="col-span-1">
                <input type="text" name="postalCode" placeholder="75001" className={inputClass} />
              </FormField>
              <FormField label="Ville" className="col-span-2">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input type="text" name="city" placeholder="Paris" className={`${inputClass} pl-9`} />
                </div>
              </FormField>
            </div>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/entreprises" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Créer l'entreprise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
