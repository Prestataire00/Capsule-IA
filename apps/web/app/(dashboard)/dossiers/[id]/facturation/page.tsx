// ARCHETYPE: command
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { Receipt } from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import { InvoiceActions } from '../../../factures/invoice-actions';
import {
  buildBillingPlan,
  type FunderAllocationInput,
  type InvoiceInput,
  type PayerLine,
} from '@/features/billing/domain/billing-plan';
import { setDossierTotalAmount, addDossierFunder, removeDossierFunder } from './actions';
import { Trash2, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid';

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'brouillon',
  issued: 'émise',
  paid: 'payée',
  overdue: 'en retard',
  cancelled: 'annulée',
  partially_paid: 'partielle',
};
const statusTone: Record<InvoiceStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  issued: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
  partially_paid: 'warning',
};

const FUNDER_KIND_LABELS: Record<string, string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  pole_emploi: 'France Travail',
  region: 'Région',
  autofinancement: 'Autofinancement',
  entreprise: 'Entreprise',
  autre: 'Autre',
};

const FUNDER_STATUS_LABELS: Record<string, string> = {
  pending: 'en attente',
  approved: 'accordé',
  refused: 'refusé',
  paid: 'payé',
};

function formatEuros(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

async function loadData(dossierId: string, organizationId: string) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, status, total_amount_cents, currency, organization_id')
    .eq('id', dossierId)
    // Ce client contourne la RLS : le périmètre d'organisation doit être posé
    // explicitement, sinon un identifiant de dossier suffit à lire la
    // facturation d'un autre organisme.
    .eq('organization_id', organizationId)
    .maybeSingle();
  const dossierTyped = dossierRow as unknown as {
    id: string;
    status: string;
    total_amount_cents: number | null;
    currency: string;
    organization_id: string;
  } | null;

  const [{ data: funderRows }, { data: invoicesRows }, { data: catalogRows }] = await Promise.all([
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status, external_file_number, funder:funders(name, kind)')
      .eq('dossier_id', dossierId)
      .eq('organization_id', organizationId),
    sb
      .schema('app')
      .from('invoices')
      .select('id, reference, status, issued_at, due_at, paid_at, subtotal_cents, total_cents, currency, funder_id')
      .eq('dossier_id', dossierId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    dossierTyped
      ? sb
          .schema('app')
          .from('funders')
          .select('id, name, kind')
          .eq('organization_id', dossierTyped.organization_id)
          .is('deleted_at', null)
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return {
    dossier: dossierTyped,
    funderCatalog: (catalogRows ?? []) as unknown as Array<{ id: string; name: string; kind: string }>,
    funders: (funderRows ?? []) as unknown as Array<{
      funder_id: string;
      amount_cents: number;
      status: string;
      external_file_number: string | null;
      funder: { name: string; kind: string } | null;
    }>,
    invoices: (invoicesRows ?? []) as unknown as Array<{
      id: string;
      reference: string;
      status: InvoiceStatus;
      issued_at: string | null;
      due_at: string | null;
      paid_at: string | null;
      subtotal_cents: number;
      total_cents: number;
      currency: string;
      funder_id: string | null;
    }>,
  };
}

export default async function FacturationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { amountSaved?: string; amountError?: string; funderSaved?: string; funderError?: string };
}) {
  // Section « billing » : ni le formateur ni le commercial n'y ont accès
  // (matrice de rôles), et la sidebar ne fait que masquer l'entrée.
  await requireAccess('billing');
  const me = await getCurrentMember();
  if (!me) notFound();

  const { dossier, funders, invoices, funderCatalog } = await loadData(params.id, me.organizationId);
  if (!dossier) notFound();

  const currency = dossier.currency || 'EUR';
  const totalHt = dossier.total_amount_cents ?? 0;
  const amountMissing = dossier.total_amount_cents == null;
  const editable = !['closed', 'archived', 'cancelled'].includes(dossier.status);

  const allocations: FunderAllocationInput[] = funders.map((f) => ({
    funderId: f.funder_id,
    name: f.funder?.name ?? 'Financeur',
    kind: f.funder?.kind ?? 'autre',
    allocatedHtCents: f.amount_cents,
    status: (f.status as FunderAllocationInput['status']) ?? 'pending',
  }));
  const invoiceInputs: InvoiceInput[] = invoices.map((i) => ({
    funderId: i.funder_id,
    subtotalHtCents: i.subtotal_cents,
    status: i.status,
  }));
  const plan = buildBillingPlan(totalHt, allocations, invoiceInputs);

  const payerLines: PayerLine[] = [...plan.funders, plan.resteACharge];

  return (
    <div className="space-y-5">
      <header>
        <SectionLabel className="mb-1">Facturation</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {dossier.total_amount_cents != null
            ? `Total HT ${formatEuros(totalHt, currency)}`
            : 'Montant total non renseigné'}
          {' · '}
          Facturé {formatEuros(plan.invoicedHtCents, currency)} HT
          {' · '}
          Restant {formatEuros(Math.max(0, plan.remainingHtCents), currency)} HT
        </p>
      </header>

      {searchParams?.amountError && (
        <InfoCallout tone="danger">
          Montant invalide. Saisissez un nombre, par ex. 1500 ou 1500,50.
        </InfoCallout>
      )}
      {searchParams?.amountSaved && !amountMissing && (
        <InfoCallout tone="success">Montant total du dossier enregistré.</InfoCallout>
      )}
      {searchParams?.funderSaved && (
        <InfoCallout tone="success">Plan de financement mis à jour.</InfoCallout>
      )}

      {editable &&
        (amountMissing ? (
          <div className="border border-amber-300/70 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl p-4">
            <p className="text-[13px] font-medium text-amber-900 dark:text-amber-200 mb-1">
              Renseignez le montant total HT du dossier
            </p>
            <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80 mb-3">
              Sans montant total, aucun payeur n&apos;est facturable et le bouton « Facturer » ne
              s&apos;affiche pas. Indiquez le montant HT total de la formation pour ce dossier.
            </p>
            <form action={setDossierTotalAmount} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="dossierId" value={dossier.id} />
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Montant total HT
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="1500,00"
                    required
                    className="w-36 rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">€ HT</span>
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition"
              >
                Enregistrer
              </button>
            </form>
          </div>
        ) : (
          <details className="group">
            <summary className="cursor-pointer select-none text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition">
              Modifier le montant total HT ({formatEuros(totalHt, currency)})
            </summary>
            <form action={setDossierTotalAmount} className="flex flex-wrap items-end gap-2 mt-3">
              <input type="hidden" name="dossierId" value={dossier.id} />
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={(totalHt / 100).toFixed(2).replace('.', ',')}
                className="w-36 rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">€ HT</span>
              <button
                type="submit"
                className="rounded-lg border border-zinc-200/70 dark:border-zinc-700 text-[13px] px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
              >
                Enregistrer
              </button>
            </form>
          </details>
        ))}

      {plan.overBilled && (
        <InfoCallout tone="danger">
          Le total facturé dépasse le montant du dossier — risque de double facturation. Vérifiez les
          factures avant émission.
        </InfoCallout>
      )}
      {plan.overAllocated && !plan.overBilled && (
        <InfoCallout tone="warning">
          La somme des financements dépasse le montant total HT du dossier. Ajustez les montants pris en
          charge.
        </InfoCallout>
      )}

      {/* Plan de financement : saisie des lignes (CPF, autofinancement, OPCO…) */}
      {editable && (
        <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/60 dark:bg-zinc-900/40 flex items-center justify-between">
            <span className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
              Plan de financement
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Chaque ligne = 1 convention + 1 facture · le reste devient « reste à charge »
            </span>
          </div>

          {searchParams?.funderError && (
            <div className="px-4 pt-3">
              <InfoCallout tone="danger">
                Ligne de financement invalide. Vérifiez le financeur et le montant.
              </InfoCallout>
            </div>
          )}

          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {funders.length === 0 ? (
              <li className="px-4 py-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                Aucune ligne de financement. Ajoutez-en une ci-dessous (ex. CPF), le reliquat sera
                imputé au reste à charge (autofinancement).
              </li>
            ) : (
              funders.map((f) => (
                <li
                  key={f.funder_id}
                  className="px-4 py-2.5 grid grid-cols-[1fr_120px_40px] gap-3 items-center text-[13px]"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-zinc-900 dark:text-zinc-100">{f.funder?.name ?? 'Financeur'}</span>
                    {f.funder?.kind && (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {' '}· {FUNDER_KIND_LABELS[f.funder.kind] ?? f.funder.kind}
                      </span>
                    )}
                    {f.external_file_number && (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 block">
                        Dossier n° {f.external_file_number}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-right text-zinc-700 dark:text-zinc-300">
                    {formatEuros(f.amount_cents, currency)}
                  </span>
                  <form action={removeDossierFunder} className="text-right">
                    <input type="hidden" name="dossierId" value={dossier.id} />
                    <input type="hidden" name="funderId" value={f.funder_id} />
                    <button
                      type="submit"
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition p-1"
                      title="Retirer cette ligne"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>

          {funderCatalog.length === 0 ? (
            <div className="px-4 py-3 border-t border-zinc-200/60 dark:border-zinc-800">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Aucun financeur enregistré.{' '}
                <Link href="/financeurs" className="text-violet-600 hover:text-violet-700 dark:text-violet-400">
                  Créez d&apos;abord vos financeurs
                </Link>{' '}
                (CPF, OPCO, autofinancement…) pour les rattacher ici.
              </p>
            </div>
          ) : (
            <form
              action={addDossierFunder}
              className="px-4 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="dossierId" value={dossier.id} />
              <div className="min-w-[180px] flex-1">
                <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Financeur
                </label>
                <select
                  name="funderId"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                >
                  <option value="" disabled>— Choisir —</option>
                  {funderCatalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {FUNDER_KIND_LABELS[c.kind] ?? c.kind}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Montant HT
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="2000,00"
                    required
                    className="w-28 rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">€</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  N° dossier (opt.)
                </label>
                <input
                  name="externalFileNumber"
                  placeholder="ex. CPF-…"
                  className="w-32 rounded-lg border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
              </button>
            </form>
          )}
        </div>
      )}

      {/* Répartition par payeur : 1 facture par financeur + reste à charge */}
      <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/60 dark:bg-zinc-900/40 text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 grid grid-cols-[1fr_110px_110px_110px_120px] gap-3">
          <span>Payeur</span>
          <span className="text-right">Alloué</span>
          <span className="text-right">Facturé</span>
          <span className="text-right">Restant</span>
          <span className="text-right">Action</span>
        </div>
        <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {payerLines.map((line) => {
            const isReste = line.payer === null;
            const payerParam = isReste ? 'reste' : line.payer;
            const canInvoice = line.remainingHtCents > 0 && line.status !== 'refused';
            return (
              <li
                key={isReste ? 'reste' : line.payer}
                className="px-4 py-3 grid grid-cols-[1fr_110px_110px_110px_120px] gap-3 items-center text-[13px]"
              >
                <span className="min-w-0">
                  <span className="text-zinc-900 dark:text-zinc-100">{line.label}</span>
                  {line.kind && (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {' '}
                      · {FUNDER_KIND_LABELS[line.kind] ?? line.kind}
                    </span>
                  )}
                  {line.status && line.status !== 'pending' && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 block">
                      {FUNDER_STATUS_LABELS[line.status] ?? line.status}
                    </span>
                  )}
                </span>
                <span className="font-mono text-right text-zinc-700 dark:text-zinc-300">
                  {formatEuros(line.allocatedHtCents, currency)}
                </span>
                <span className="font-mono text-right text-zinc-700 dark:text-zinc-300">
                  {formatEuros(line.invoicedHtCents, currency)}
                </span>
                <span
                  className={`font-mono text-right ${
                    line.remainingHtCents < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {formatEuros(line.remainingHtCents, currency)}
                </span>
                <span className="text-right">
                  {canInvoice ? (
                    <Link
                      href={`/factures/nouvelle?dossierId=${dossier.id}&payer=${payerParam}`}
                      className="inline-flex items-center gap-1 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Facturer
                    </Link>
                  ) : (
                    <span className="text-[11px] text-zinc-400">—</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Factures émises pour ce dossier */}
      <div className="space-y-2">
        <SectionLabel>Factures</SectionLabel>
        {invoices.length === 0 ? (
          <InfoCallout tone="info">
            {dossier.status === 'closed'
              ? 'Aucune facture liée à ce dossier.'
              : amountMissing
                ? 'Aucune facture — renseignez d’abord le montant total HT du dossier ci-dessus pour pouvoir facturer.'
                : 'Aucune facture émise — cliquez sur « Facturer » en face d’un payeur pour en créer une.'}
          </InfoCallout>
        ) : (
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="grid grid-cols-[160px_1fr_140px_120px_120px_100px] gap-3 py-3 px-1 items-center text-[13px]"
              >
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{inv.reference}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {inv.issued_at
                    ? `Émise le ${format(parseISO(inv.issued_at), 'dd MMM yyyy', { locale: fr })}`
                    : 'Brouillon'}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {inv.due_at && inv.status === 'issued'
                    ? `Échéance ${format(parseISO(inv.due_at), 'dd/MM/yy')}`
                    : '—'}
                </span>
                <span className="font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100 text-right">
                  {formatEuros(inv.total_cents, inv.currency)}
                </span>
                <StatusPill tone={statusTone[inv.status]}>{statusLabel[inv.status]}</StatusPill>
                <InvoiceActions invoiceId={inv.id} pdfUrl={`/api/invoices/${inv.id}/facture.pdf`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
