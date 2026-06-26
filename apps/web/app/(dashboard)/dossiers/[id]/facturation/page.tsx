// ARCHETYPE: command
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { Receipt } from 'lucide-react';
import { env } from '@/env.mjs';
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

async function loadData(dossierId: string) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: dossierRow }, { data: funderRows }, { data: invoicesRows }] = await Promise.all([
    sb
      .schema('app')
      .from('dossiers')
      .select('id, status, total_amount_cents, currency')
      .eq('id', dossierId)
      .maybeSingle(),
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status, external_file_number, funder:funders(name, kind)')
      .eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('id, reference, status, issued_at, due_at, paid_at, subtotal_cents, total_cents, currency, funder_id')
      .eq('dossier_id', dossierId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  return {
    dossier: dossierRow as unknown as {
      id: string;
      status: string;
      total_amount_cents: number | null;
      currency: string;
    } | null,
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

export default async function FacturationPage({ params }: { params: { id: string } }) {
  const { dossier, funders, invoices } = await loadData(params.id);
  if (!dossier) notFound();

  const currency = dossier.currency || 'EUR';
  const totalHt = dossier.total_amount_cents ?? 0;

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
              : 'Aucune facture émise — utilisez « Facturer » ci-dessus pour en créer une par payeur.'}
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
