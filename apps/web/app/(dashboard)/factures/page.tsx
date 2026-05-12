// ARCHETYPE: command
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { invoices, dossiers, formatEuros } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { InvoiceActions } from './invoice-actions';

const statusLabel = { draft: 'brouillon', issued: 'émise', paid: 'payée', overdue: 'en retard', cancelled: 'annulée', partially_paid: 'partielle' };
const statusTone = { draft: 'neutral', issued: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral', partially_paid: 'warning' } as const;

export default function FacturesPage() {
  const issued = invoices.filter((i) => i.status === 'issued' || i.status === 'paid' || i.status === 'overdue');
  const totalIssued = issued.reduce((acc, i) => acc + i.totalCents, 0);
  const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((acc, i) => acc + i.totalCents, 0);
  const overdue = invoices.filter((i) => i.status === 'overdue');

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Comptabilité</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Factures</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{invoices.length} factures</p>
        </div>
        <div className="flex items-center gap-2">
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
        <StatCard label="Émises" value={formatEuros(totalIssued)} hint={`${issued.length} factures`} />
        <StatCard label="Encaissées" value={formatEuros(totalPaid)} hint={`${invoices.filter((i) => i.status === 'paid').length} payées`} />
        <StatCard label="En attente" value={formatEuros(totalIssued - totalPaid)} hint={`${invoices.filter((i) => i.status === 'issued').length} émises`} />
        <StatCard label="En retard" value={overdue.length} hint={overdue.length > 0 ? formatEuros(overdue.reduce((a, i) => a + i.totalCents, 0)) : '—'} />
      </section>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {invoices.map((inv) => {
          const dossier = inv.dossierId ? dossiers.find((d) => d.id === inv.dossierId) : null;
          return (
            <li key={inv.id} className="grid grid-cols-[140px_140px_1fr_120px_120px_100px] gap-3 py-3 px-1 items-center text-[13px]">
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{inv.reference}</span>
              {dossier ? <IdPill>{dossier.reference}</IdPill> : <span className="text-zinc-400 text-[11px]">—</span>}
              <span className="font-mono text-[11px] text-zinc-500">
                {inv.issuedAt ? `Émise ${format(parseISO(inv.issuedAt), 'dd MMM', { locale: fr })}` : 'Brouillon'}
                {inv.dueAt && inv.status === 'issued' && ` · échéance ${format(parseISO(inv.dueAt), 'dd/MM')}`}
                {inv.paidAt && ` · payée ${format(parseISO(inv.paidAt), 'dd/MM')}`}
              </span>
              <span className="font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100 text-right">
                {formatEuros(inv.totalCents)}
              </span>
              <StatusPill tone={statusTone[inv.status]}>{statusLabel[inv.status]}</StatusPill>
              <InvoiceActions
                invoiceId={inv.id}
                pdfUrl={`/api/invoices/${inv.id}/facture.pdf`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
