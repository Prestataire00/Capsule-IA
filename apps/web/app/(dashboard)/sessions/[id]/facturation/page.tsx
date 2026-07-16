import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

const euros = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

type InvoiceRow = { id: string; dossier_id: string; status: string; total_cents: number; issued_at: string | null };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée', partial: 'Partielle',
};

export default async function SessionInvoicingTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { dossierIds } = loaded;

  let invoices: InvoiceRow[] = [];
  if (dossierIds.length) {
    const { data } = await sb
      .schema('app')
      .from('invoices')
      .select('id, dossier_id, status, total_cents, issued_at')
      .in('dossier_id', dossierIds)
      .order('issued_at', { ascending: false });
    invoices = (data as unknown as InvoiceRow[] | null) ?? [];
  }

  const total = invoices.reduce((a, i) => a + (i.total_cents ?? 0), 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + (i.total_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Vue agrégée en lecture. La facturation reste nominative (par apprenant) — gérée depuis chaque dossier.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total facturé" value={euros(total)} />
        <Stat label="Encaissé" value={euros(paid)} />
        <Stat label="Factures" value={String(invoices.length)} />
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState icon={Receipt} title="Aucune facture" description="Aucune facture rattachée aux apprenants de cette session." />
        </div>
      ) : (
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800 text-[13px]">
          {invoices.map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
              <Link href={`/dossiers/${i.dossier_id}/facturation`} className="text-zinc-800 dark:text-zinc-200 hover:text-violet-600">
                {euros(i.total_cents ?? 0)}
              </Link>
              <StatusPill tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : 'neutral'}>
                {STATUS_LABEL[i.status] ?? i.status}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
