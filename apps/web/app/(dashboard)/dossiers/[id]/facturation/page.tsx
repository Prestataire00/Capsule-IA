// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dossiers, invoices, formatEuros, funderName } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

export default function FacturationPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const dossierInvoices = invoices.filter((i) => i.dossierId === dossier.id);

  return (
    <div className="space-y-4">
      <header>
        <SectionLabel className="mb-1">Facturation</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Financement {funderName(dossier.funderId)} · Total HT {formatEuros(dossier.totalAmountCents)}
        </p>
      </header>

      {dossierInvoices.length === 0 && (
        <InfoCallout tone="info">
          {dossier.status === 'closed' ? 'Aucune facture liée à ce dossier.' : 'La facture sera émise à la clôture du dossier.'}
        </InfoCallout>
      )}

      {dossierInvoices.length > 0 && (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {dossierInvoices.map((inv) => (
            <li key={inv.id} className="grid grid-cols-[160px_1fr_140px_120px_120px] gap-3 py-3 px-1 items-center text-[13px]">
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{inv.reference}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {inv.issuedAt ? `Émise le ${format(parseISO(inv.issuedAt), 'dd MMM yyyy', { locale: fr })}` : 'Brouillon'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {inv.dueAt && inv.status === 'issued' ? `Échéance ${format(parseISO(inv.dueAt), 'dd/MM/yy')}` : '—'}
              </span>
              <span className="font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100 text-right">
                {formatEuros(inv.totalCents)}
              </span>
              <StatusPill tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : inv.status === 'issued' ? 'warning' : 'neutral'}>
                {inv.status === 'paid' ? 'payée' : inv.status === 'overdue' ? 'en retard' : inv.status === 'issued' ? 'émise' : 'brouillon'}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
