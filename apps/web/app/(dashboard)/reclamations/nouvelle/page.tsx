// ARCHETYPE: workflow
// Justification: saisie manuelle d'une réclamation (Qualiopi I31) — formulaire focalisé.

import Link from 'next/link';
import { ArrowLeft, MessageSquareWarning } from 'lucide-react';
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
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link href="/reclamations" className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux réclamations
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-sm">
            <MessageSquareWarning className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Nouvelle réclamation</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Saisie manuelle — tracée pour l'indicateur Qualiopi I31.</p>
          </div>
        </header>

        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-5">
            {errorMsg}
          </div>
        )}

        <form action={createComplaint} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <section className="p-6 space-y-4">
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
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Réclamant (optionnel)</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nom">
                <input type="text" name="reporterName" maxLength={200} className={inputClass} />
              </FormField>
              <FormField label="Email">
                <input type="email" name="reporterEmail" maxLength={255} className={inputClass} />
              </FormField>
            </div>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/reclamations" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">Annuler</Link>
            <FormSubmit label="Enregistrer la réclamation" pendingLabel="Enregistrement…" />
          </div>
        </form>
      </div>
    </div>
  );
}
