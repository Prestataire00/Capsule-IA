// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import { InvoiceActions } from '../../../factures/invoice-actions';

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

function formatEuros(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

async function loadData(dossierId: string) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: dossierRow }, { data: invoicesRows }] = await Promise.all([
    sb
      .schema('app')
      .from('dossiers')
      .select('id, status, total_amount_cents, currency, funder:funders(name, kind)')
      .eq('id', dossierId)
      .maybeSingle(),
    sb
      .schema('app')
      .from('invoices')
      .select('id, reference, status, issued_at, due_at, paid_at, total_cents, currency')
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
      funder: { name: string; kind: string } | null;
    } | null,
    invoices: (invoicesRows ?? []) as unknown as Array<{
      id: string;
      reference: string;
      status: InvoiceStatus;
      issued_at: string | null;
      due_at: string | null;
      paid_at: string | null;
      total_cents: number;
      currency: string;
    }>,
  };
}

export default async function FacturationPage({ params }: { params: { id: string } }) {
  const { dossier, invoices } = await loadData(params.id);
  if (!dossier) notFound();

  const funderLine = dossier.funder
    ? `Financement ${dossier.funder.name} (${dossier.funder.kind})`
    : 'Aucun financeur renseigné';

  return (
    <div className="space-y-4">
      <header>
        <SectionLabel className="mb-1">Facturation</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {funderLine}
          {dossier.total_amount_cents != null &&
            ` · Total HT ${formatEuros(dossier.total_amount_cents, dossier.currency)}`}
        </p>
      </header>

      {invoices.length === 0 && (
        <InfoCallout tone="info">
          {dossier.status === 'closed'
            ? 'Aucune facture liée à ce dossier.'
            : 'Aucune facture émise pour ce dossier — utilisez "Nouvelle facture" pour en créer une.'}
        </InfoCallout>
      )}

      {invoices.length > 0 && (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {invoices.map((inv) => (
            <li key={inv.id} className="grid grid-cols-[160px_1fr_140px_120px_120px_100px] gap-3 py-3 px-1 items-center text-[13px]">
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{inv.reference}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {inv.issued_at ? `Émise le ${format(parseISO(inv.issued_at), 'dd MMM yyyy', { locale: fr })}` : 'Brouillon'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {inv.due_at && inv.status === 'issued' ? `Échéance ${format(parseISO(inv.due_at), 'dd/MM/yy')}` : '—'}
              </span>
              <span className="font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100 text-right">
                {formatEuros(inv.total_cents, inv.currency)}
              </span>
              <StatusPill tone={statusTone[inv.status]}>{statusLabel[inv.status]}</StatusPill>
              <InvoiceActions
                invoiceId={inv.id}
                pdfUrl={`/api/invoices/${inv.id}/facture.pdf`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
