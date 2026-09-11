// ARCHETYPE: workflow
// Justification: saisie manuelle d'une réclamation (Qualiopi I31) — formulaire focalisé.

import Link from 'next/link';
import { ArrowLeft, MessageSquareWarning, User } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { FormSubmit } from '@/shared/ui/form-submit';
import { createComplaint } from './actions';

export default function NouvelleReclamationPage({ searchParams }: { searchParams: { error?: string } }) {
  const errorMsg = searchParams.error
    ? searchParams.error === 'missing'
      ? "L'objet et la description sont obligatoires."
      : searchParams.error === 'no_org'
        ? 'Organisation introuvable.'
        : `Erreur : ${decodeURIComponent(searchParams.error)}`
    : null;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-9">
        <Link href="/reclamations" className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux réclamations
        </Link>

        <header className="mb-7">
          <div>
            <SectionLabel className="mb-2">Réclamations</SectionLabel>
            <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouvelle réclamation</h1>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">Saisie manuelle — tracée pour l'indicateur Qualiopi I31.</p>
          </div>
        </header>

        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-5">
            {errorMsg}
          </div>
        )}

        <form action={createComplaint} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.amber.soft}`}>
                <MessageSquareWarning className="w-3.5 h-3.5" />
              </span>
              Réclamation
            </p>
            <FormField label="Objet" required>
              <input type="text" name="subject" required maxLength={200} placeholder="Résumé de la réclamation" className={inputClass} />
            </FormField>
            <FormField label="Description" required>
              <textarea name="description" required rows={4} placeholder="Détail de la réclamation, contexte, demande…" className={inputClass} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Canal de réception">
                <select name="source" defaultValue="email" className={inputClass}>
                  <option value="email">Email</option>
                  <option value="phone">Téléphone</option>
                  <option value="in_person">En personne</option>
                  <option value="questionnaire">Questionnaire</option>
                  <option value="other">Autre</option>
                </select>
              </FormField>
              <FormField label="Gravité">
                <select name="severity" defaultValue="medium" className={inputClass}>
                  <option value="low">Faible</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Élevée</option>
                  <option value="critical">Critique</option>
                </select>
              </FormField>
            </div>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.rose.soft}`}>
                <User className="w-3.5 h-3.5" />
              </span>
              Réclamant (optionnel)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nom">
                <input type="text" name="reporterName" maxLength={200} className={inputClass} />
              </FormField>
              <FormField label="Email">
                <input type="email" name="reporterEmail" maxLength={255} className={inputClass} />
              </FormField>
            </div>
          </section>

          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950/40 rounded-b-xl flex items-center justify-between gap-3">
            <Link href="/reclamations" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">Annuler</Link>
            <FormSubmit label="Enregistrer la réclamation" pendingLabel="Enregistrement…" />
          </div>
        </form>
      </div>
    </div>
  );
}
