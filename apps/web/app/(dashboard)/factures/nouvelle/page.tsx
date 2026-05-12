// ARCHETYPE: workflow
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Check, Receipt, Euro, Calendar, FileText } from 'lucide-react';
import { env } from '@/env.mjs';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createInvoice } from '../actions';

export const dynamic = 'force-dynamic';

async function loadDossiers() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, formation:formations(title), learner:learners(first_name, last_name)')
    .in('status', ['active', 'scheduled', 'completed', 'closed'])
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as Array<{
    id: string;
    reference: string;
    formation: { title: string } | null;
    learner: { first_name: string; last_name: string } | null;
  }>;
}

export default async function NouvelleFacturePage({ searchParams }: { searchParams: { error?: string } }) {
  const dossiersList = await loadDossiers();

  return (
    <div className="max-w-2xl w-full mx-auto px-8 py-10">
      <Link
        href="/factures"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux factures
      </Link>

      <header className="mb-8 flex items-center gap-3">
        <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-sm">
          <Receipt className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Nouvelle facture
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Créez une facture rattachée à un dossier de formation.
          </p>
        </div>
      </header>

      {searchParams.error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6">
          {searchParams.error === 'invalid'
            ? 'Certains champs sont invalides. Vérifiez la saisie.'
            : searchParams.error === 'dossier_not_found'
            ? 'Dossier introuvable.'
            : "Une erreur est survenue lors de la création."}
        </div>
      )}

      {dossiersList.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-10 text-center">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-2">
            Aucun dossier disponible pour facturer.
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Créez d'abord un dossier (statut actif, planifié, terminé ou clos).
          </p>
        </div>
      ) : (
        <form
          action={createInvoice}
          className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800"
        >
          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
              Rattachement
            </p>
            <FormField label="Dossier" required>
              <select name="dossierId" required defaultValue="" className={`${inputClass} appearance-none bg-no-repeat bg-right pr-8`}>
                <option value="" disabled>
                  — Sélectionner un dossier —
                </option>
                {dossiersList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.reference} · {d.formation?.title ?? '—'}
                    {d.learner ? ` · ${d.learner.first_name} ${d.learner.last_name}` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
              Montants
            </p>
            <FormField label="Description de la prestation" required>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="description"
                  required
                  minLength={3}
                  placeholder="Formation Comptabilité Niveau 2 (70h, présentiel)"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </FormField>

            <div className="grid grid-cols-3 gap-3">
              <FormField label="Prix unitaire HT (centimes)" required>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="number"
                    name="unitAmountCents"
                    required
                    min={0}
                    step={1}
                    placeholder="350000"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
              <FormField label="Quantité">
                <input
                  type="number"
                  name="quantity"
                  defaultValue="1"
                  min={0.01}
                  step={0.01}
                  className={inputClass}
                />
              </FormField>
              <FormField label="TVA (%)">
                <input
                  type="number"
                  name="vatRate"
                  defaultValue="20"
                  min={0}
                  max={100}
                  step={0.1}
                  className={inputClass}
                />
              </FormField>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 -mt-1">
              💡 Prix HT en <strong>centimes</strong> (ex : 350000 = 3 500,00 €). Les formations professionnelles sont souvent exonérées de TVA (mettre 0).
            </p>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
              Échéance & statut
            </p>
            <FormField label="Date d'échéance (optionnelle)">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input type="date" name="dueAt" className={`${inputClass} pl-9`} />
              </div>
            </FormField>

            <label className="flex items-start gap-3 cursor-pointer p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
              <input type="checkbox" name="issuedNow" className="mt-0.5 accent-violet-600" />
              <div>
                <span className="text-[13px] text-zinc-900 dark:text-zinc-100 font-medium">
                  Émettre immédiatement
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                  Sinon, la facture sera créée en statut brouillon — vous pourrez l'émettre plus tard.
                </span>
              </div>
            </label>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link
              href="/factures"
              className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Annuler
            </Link>
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              Créer la facture
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
