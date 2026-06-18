// ARCHETYPE: command
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { Receipt } from 'lucide-react';
import { InvoiceActions } from './invoice-actions';
import { requireAccess } from '@/shared/lib/auth/require-access';

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

type InvoiceRow = {
  id: string;
  reference: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  total_cents: number;
  currency: string;
  dossier: { reference: string } | null;
  funder: { name: string } | null;
  company: { name: string } | null;
};

const STATUSES: InvoiceStatus[] = ['draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled'];

function resolvePayer(inv: InvoiceRow): string | null {
  if (inv.funder?.name) return `OPCO/financeur: ${inv.funder.name}`;
  if (inv.company?.name) return `Entreprise: ${inv.company.name}`;
  return null;
}

async function loadInvoices(status: InvoiceStatus | null): Promise<InvoiceRow[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = sb
    .schema('app')
    .from('invoices')
    .select('id, reference, status, issued_at, due_at, paid_at, total_cents, currency, dossier:dossiers(reference), funder:funders(name), company:companies(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[factures] load failed', error);
    return [];
  }
  return (data ?? []) as unknown as InvoiceRow[];
}

export default async function FacturesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAccess('billing');
  const status = STATUSES.includes(searchParams.status as InvoiceStatus)
    ? (searchParams.status as InvoiceStatus)
    : null;
  const exportHref = status ? `/api/factures/export.csv?status=${status}` : '/api/factures/export.csv';
  const invoices = await loadInvoices(status);

  const issued = invoices.filter((i) => i.status === 'issued' || i.status === 'paid' || i.status === 'overdue');
  const totalIssued = issued.reduce((acc, i) => acc + i.total_cents, 0);
  const paid = invoices.filter((i) => i.status === 'paid');
  const totalPaid = paid.reduce((acc, i) => acc + i.total_cents, 0);
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const totalOverdue = overdue.reduce((acc, i) => acc + i.total_cents, 0);

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Comptabilité</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Factures</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {invoices.length} facture{invoices.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportHref}
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter CSV
          </a>
          <button
            type="button"
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Export FEC
          </button>
          <Link
            href="/factures/nouvelle"
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouvelle facture
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Émises" value={formatEuros(totalIssued)} hint={`${issued.length} facture${issued.length > 1 ? 's' : ''}`} />
        <StatCard label="Encaissées" value={formatEuros(totalPaid)} hint={`${paid.length} payée${paid.length > 1 ? 's' : ''}`} />
        <StatCard label="En attente" value={formatEuros(totalIssued - totalPaid)} hint={`${invoices.filter((i) => i.status === 'issued').length} émise${invoices.filter((i) => i.status === 'issued').length > 1 ? 's' : ''}`} />
        <StatCard label="En retard" value={overdue.length} hint={overdue.length > 0 ? formatEuros(totalOverdue) : '—'} />
      </section>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucune facture pour l'instant"
          description="Créez votre première facture rattachée à un dossier de formation."
          action={
            <Link
              href="/factures/nouvelle"
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouvelle facture
            </Link>
          }
        />
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="grid grid-cols-[140px_140px_150px_1fr_120px_120px_100px] gap-3 py-3 px-1 items-center text-[13px]"
            >
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{inv.reference}</span>
              {inv.dossier ? (
                <IdPill>{inv.dossier.reference}</IdPill>
              ) : (
                <span className="text-zinc-400 text-[11px]">—</span>
              )}
              {resolvePayer(inv) ? (
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate" title={resolvePayer(inv) ?? undefined}>
                  {resolvePayer(inv)}
                </span>
              ) : (
                <span className="text-zinc-400 text-[11px]">—</span>
              )}
              <span className="font-mono text-[11px] text-zinc-500">
                {inv.issued_at ? `Émise ${format(parseISO(inv.issued_at), 'dd MMM', { locale: fr })}` : 'Brouillon'}
                {inv.due_at && inv.status === 'issued' && ` · échéance ${format(parseISO(inv.due_at), 'dd/MM')}`}
                {inv.paid_at && ` · payée ${format(parseISO(inv.paid_at), 'dd/MM')}`}
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
