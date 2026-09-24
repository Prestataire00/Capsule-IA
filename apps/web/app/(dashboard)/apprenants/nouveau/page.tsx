// ARCHETYPE: workflow
// Justification: création d'un apprenant — formulaire focalisé, pas de sidebar.

import Link from 'next/link';
import { ArrowLeft, Mail, Phone, Building2, Accessibility } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { SectionLabel } from '@/shared/ui/section-label';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { createLearner } from './actions';
import { SubmitButton } from './submit-button';
import { requireAccess } from '@/shared/lib/auth/require-access';

export default async function NouvelApprenantPage({ searchParams }: { searchParams: { error?: string } }) {
  await requireAccess('dossiers', 'manage');
  const sb = supabaseServer();
  const errorMsg = searchParams.error
    ? searchParams.error === 'missing'
      ? 'Le prénom et le nom sont obligatoires.'
      : searchParams.error === 'no_org'
        ? 'Organisation introuvable.'
        : `Erreur : ${decodeURIComponent(searchParams.error)}`
    : null;
  const { data: companiesData } = await sb
    .schema('app')
    .from('companies')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companies = (companiesData as any[]) ?? [];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/apprenants"
          className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux apprenants
        </Link>

        <header className="mb-8">
          <SectionLabel className="mb-2">Apprenants</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouvel apprenant</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            Ajoutez un apprenant à votre carnet pour pouvoir l'inscrire à un dossier.
          </p>
        </header>

        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-5">
            {errorMsg}
          </div>
        )}

        <form action={createLearner} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {/* Identité */}
          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Identité</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Prénom" required>
                <input type="text" name="firstName" required placeholder="Alice" className={inputClass} />
              </FormField>
              <FormField label="Nom" required>
                <input type="text" name="lastName" required placeholder="Martin" className={inputClass} />
              </FormField>
            </div>
            <FormField label="Email" hint="Sans adresse, aucun envoi automatique ne le concernera. Il s’émarge par son nom.">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  placeholder="alice.martin@email.com"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Téléphone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input type="tel" name="phone" placeholder="06 12 34 56 78" className={`${inputClass} pl-9`} />
                </div>
              </FormField>
              <FormField label="Date de naissance">
                <input type="date" name="birthDate" className={inputClass} />
              </FormField>
            </div>
          </section>

          {/* Contexte pro */}
          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Contexte professionnel</p>
            <FormField label="Entreprise" hint="Laissez vide si l'apprenant est indépendant ou en autofinancement.">
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <select name="companyId" defaultValue="" className={`${inputClass} pl-9 appearance-none bg-no-repeat bg-right pr-8`}>
                  <option value="">— Aucune (indépendant) —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Poste / fonction">
                <input type="text" name="position" placeholder="Comptable, Manager…" className={inputClass} />
              </FormField>
              <FormField label="Statut">
                <select name="statut" defaultValue="" className={inputClass}>
                  <option value="">— Non précisé —</option>
                  <option value="salarie">Salarié(e)</option>
                  <option value="dirigeant">Dirigeant(e)</option>
                  <option value="independant">Indépendant(e)</option>
                </select>
              </FormField>
            </div>
          </section>

          {/* Accessibilité */}
          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Accessibilité</p>
            <label className="flex items-start gap-3 cursor-pointer p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
              <input type="checkbox" name="rqth" className="mt-0.5 accent-orange-500" />
              <div>
                <span className="text-[13px] text-zinc-900 dark:text-zinc-100 font-medium inline-flex items-center gap-1.5">
                  <Accessibility className="w-3.5 h-3.5 text-blue-500" />
                  Reconnaissance de la qualité de travailleur handicapé (RQTH)
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                  Active la prise en compte d'adaptations pédagogiques au moment de la planification.
                </span>
              </div>
            </label>
            <FormField label="Notes d'accessibilité ou besoins spécifiques">
              <textarea
                name="accessibilityNotes"
                rows={3}
                placeholder="Salle au RDC, support visuel, prise de notes, etc."
                className={inputClass}
              />
            </FormField>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link
              href="/apprenants"
              className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Annuler
            </Link>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
