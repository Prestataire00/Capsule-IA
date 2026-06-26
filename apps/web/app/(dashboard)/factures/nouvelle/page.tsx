// ARCHETYPE: workflow
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Check, Receipt, Euro, Calendar, FileText } from 'lucide-react';
import { env } from '@/env.mjs';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createInvoice } from '../actions';
import { requireAccess } from '@/shared/lib/auth/require-access';
import {
  buildBillingPlan,
  type FunderAllocationInput,
  type InvoiceInput,
  type PayerLine,
} from '@/features/billing/domain/billing-plan';

export const dynamic = 'force-dynamic';

const FUNDER_KIND_LABELS: Record<string, string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  pole_emploi: 'France Travail',
  region: 'Région',
  autofinancement: 'Autofinancement',
  entreprise: 'Entreprise',
  autre: 'Autre',
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Certains champs sont invalides. Vérifiez la saisie.',
  dossier_not_found: 'Dossier introuvable.',
  amount_not_positive: 'Le montant doit être strictement positif.',
  unknown_payer: 'Ce payeur n’est pas rattaché au dossier.',
  funder_refused: 'Ce financeur a refusé la prise en charge — facturation impossible.',
  exceeds_payer_allocation:
    'Le montant dépasse ce qu’il reste à facturer pour ce payeur (anti-double-facturation).',
  exceeds_dossier_total:
    'Le montant ferait dépasser le total du dossier (anti-double-facturation).',
};

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

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

/** Charge le plan de facturation d'un dossier (financeurs + reste à charge) pour pré-remplir. */
async function loadDossierBilling(dossierId: string) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: dossierRow }, { data: funderRows }, { data: invoiceRows }] = await Promise.all([
    sb.schema('app').from('dossiers').select('id, total_amount_cents').eq('id', dossierId).maybeSingle(),
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status, funder:funders(name, kind)')
      .eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('funder_id, subtotal_cents, status')
      .eq('dossier_id', dossierId)
      .is('deleted_at', null),
  ]);
  if (!dossierRow) return null;
  const dossier = dossierRow as unknown as { id: string; total_amount_cents: number | null };

  const allocations: FunderAllocationInput[] = (
    (funderRows ?? []) as unknown as Array<{
      funder_id: string;
      amount_cents: number;
      status: string;
      funder: { name: string; kind: string } | null;
    }>
  ).map((f) => ({
    funderId: f.funder_id,
    name: f.funder?.name ?? 'Financeur',
    kind: f.funder?.kind ?? 'autre',
    allocatedHtCents: f.amount_cents,
    status: (f.status as FunderAllocationInput['status']) ?? 'pending',
  }));
  const invoices: InvoiceInput[] = (
    (invoiceRows ?? []) as unknown as Array<{ funder_id: string | null; subtotal_cents: number; status: string }>
  ).map((i) => ({ funderId: i.funder_id, subtotalHtCents: i.subtotal_cents, status: i.status }));

  return buildBillingPlan(dossier.total_amount_cents ?? 0, allocations, invoices);
}

export default async function NouvelleFacturePage({
  searchParams,
}: {
  searchParams: { error?: string; dossierId?: string; payer?: string };
}) {
  await requireAccess('billing', 'manage');
  const dossiersList = await loadDossiers();

  const prefillDossierId = searchParams.dossierId ?? '';
  const plan = prefillDossierId ? await loadDossierBilling(prefillDossierId) : null;

  // Lignes payeur sélectionnables (financeurs non soldés + reste à charge).
  const payerLines: PayerLine[] = plan ? [...plan.funders, plan.resteACharge] : [];
  const selectedPayerParam = searchParams.payer ?? '';
  const selectedFunderId =
    selectedPayerParam === 'reste' ? '' : selectedPayerParam;
  const selectedLine =
    plan && selectedPayerParam
      ? selectedPayerParam === 'reste'
        ? plan.resteACharge
        : plan.funders.find((f) => f.payer === selectedPayerParam) ?? null
      : null;
  const prefillAmountCents = selectedLine ? Math.max(0, selectedLine.remainingHtCents) : null;

  return (
    <div className="max-w-2xl w-full mx-auto px-8 py-10">
      <Link
        href={prefillDossierId ? `/dossiers/${prefillDossierId}/facturation` : '/factures'}
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {prefillDossierId ? 'Retour à la facturation du dossier' : 'Retour aux factures'}
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
            Une facture par payeur (financeur ou reste à charge) — rattachée à un seul dossier.
          </p>
        </div>
      </header>

      {searchParams.error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6">
          {ERROR_MESSAGES[searchParams.error] ?? 'Une erreur est survenue lors de la création.'}
        </div>
      )}

      {dossiersList.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-10 text-center">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-2">
            Aucun dossier disponible pour facturer.
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Créez d&apos;abord un dossier (statut actif, planifié, terminé ou clos).
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
              <select
                name="dossierId"
                required
                defaultValue={prefillDossierId}
                className={`${inputClass} appearance-none bg-no-repeat bg-right pr-8`}
              >
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

            {plan ? (
              <FormField label="Payeur" required>
                <select
                  name="funderId"
                  defaultValue={selectedFunderId}
                  className={`${inputClass} appearance-none bg-no-repeat bg-right pr-8`}
                >
                  {payerLines.map((line) => {
                    const value = line.payer ?? '';
                    const kindLabel = line.kind ? ` · ${FUNDER_KIND_LABELS[line.kind] ?? line.kind}` : '';
                    return (
                      <option key={value || 'reste'} value={value}>
                        {line.label}
                        {kindLabel} — restant {formatEuros(Math.max(0, line.remainingHtCents))}
                      </option>
                    );
                  })}
                </select>
              </FormField>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                💡 Pour facturer un financeur précis (subrogation), passez par l&apos;onglet{' '}
                <strong>Facturation</strong> du dossier : le payeur et le montant restant y sont
                pré-remplis. Sans cela, la facture sera imputée au reste à charge.
              </p>
            )}
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
                  defaultValue={selectedLine ? `${selectedLine.label} — prise en charge` : ''}
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
                    defaultValue={prefillAmountCents != null ? String(prefillAmountCents) : ''}
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
              💡 Prix HT en <strong>centimes</strong> (ex : 350000 = 3 500,00 €). Les formations
              professionnelles sont souvent exonérées de TVA (mettre 0).
              {prefillAmountCents != null && (
                <>
                  {' '}
                  Montant restant pour ce payeur : <strong>{formatEuros(prefillAmountCents)}</strong>.
                </>
              )}
            </p>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
              Échéance &amp; statut
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
                  Sinon, la facture sera créée en statut brouillon — vous pourrez l&apos;émettre plus tard.
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
