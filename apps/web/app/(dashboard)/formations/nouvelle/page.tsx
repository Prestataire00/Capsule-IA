// ARCHETYPE: workflow
import Link from 'next/link';
import { ArrowLeft, Check, BookOpen, Hash, Clock, Euro, Eye } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

export default function NouvelleFormationPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/formations"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour au catalogue
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/60 dark:to-amber-950/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouvelle formation
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez une formation au catalogue de votre OF.
            </p>
          </div>
        </header>

        <form action="/formations" method="get" className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Identification</p>
            <FormField label="Code" required hint="Identifiant court, sans espaces (ex : FORM-COMPTA-01).">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="code"
                  required
                  placeholder="FORM-COMPTA-01"
                  className={`${inputClass} pl-9 font-mono`}
                />
              </div>
            </FormField>
            <FormField label="Titre" required>
              <input
                type="text"
                name="title"
                required
                placeholder="Initiation à la comptabilité générale"
                className={inputClass}
              />
            </FormField>
            <FormField label="Description">
              <textarea
                name="description"
                rows={3}
                placeholder="Présentation du contenu et des objectifs pédagogiques…"
                className={inputClass}
              />
            </FormField>
            <FormField label="Public visé">
              <input
                type="text"
                name="targetAudience"
                placeholder="Comptables débutants, assistants administratifs…"
                className={inputClass}
              />
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Modalité & format</p>
            <FormField label="Modalité par défaut" required>
              <div className="grid grid-cols-2 gap-2">
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="modality" value="presentiel" defaultChecked className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Présentiel</p>
                </label>
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="modality" value="distanciel" className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Distanciel</p>
                </label>
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="modality" value="hybride" className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Hybride</p>
                </label>
                <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
                  <input type="radio" name="modality" value="afest" className="sr-only" />
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">AFEST</p>
                </label>
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Durée (heures)" required>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="number"
                    name="defaultHours"
                    required
                    min={1}
                    placeholder="14"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
              <FormField label="Tarif par défaut">
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="number"
                    name="defaultPrice"
                    min={0}
                    placeholder="1200"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
            </div>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Publication</p>
            <label className="flex items-start gap-3 cursor-pointer p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
              <input type="checkbox" name="isPublished" className="mt-0.5 accent-violet-600" />
              <div>
                <span className="text-[13px] text-zinc-900 dark:text-zinc-100 font-medium inline-flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                  Publier au catalogue
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                  Si décoché, la formation sera créée en brouillon et invisible aux apprenants.
                </span>
              </div>
            </label>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/formations" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Créer la formation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
