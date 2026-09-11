import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { loadSession } from '@/features/sessions/load-session';
import { loadQuotesForSession } from '@/features/billing/quotes/queries';
import { isQuoteActive } from '@/features/billing/domain/quote';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusPill } from '@/shared/ui/status-pill';
import { QuoteCard } from '../../../devis/_components/quote-card.client';

export const dynamic = 'force-dynamic';

const euros = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

type InvoiceRow = { id: string; reference: string; dossier_id: string; status: string; total_cents: number; issued_at: string | null };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
  partially_paid: 'Partielle',
};

export default async function SessionInvoicingTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { dossierIds, session } = loaded;
  const me = await getCurrentMember();
  if (!me) notFound();
  const canManage = can(me.role, 'billing') === 'manage';

  const admin = supabaseAdmin() as unknown as SupabaseClient;
  const [quotes, { data: priceRow }, invoicesRes] = await Promise.all([
    loadQuotesForSession(admin, params.id, me.organizationId),
    admin.schema('app').from('sessions').select('price_cents').eq('id', params.id).maybeSingle(),
    dossierIds.length
      ? sb
          .schema('app')
          .from('invoices')
          .select('id, reference, dossier_id, status, total_cents, issued_at')
          .in('dossier_id', dossierIds)
          .is('deleted_at', null)
          .order('issued_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const invoices = ((invoicesRes.data as unknown as InvoiceRow[] | null) ?? []).filter((i) => i.status !== 'cancelled');

  let unitPrice = (priceRow as { price_cents: number | null } | null)?.price_cents ?? null;
  if (unitPrice == null && session.formation_id) {
    const { data: f } = await admin
      .schema('app')
      .from('formations')
      .select('default_price_cents')
      .eq('id', session.formation_id)
      .maybeSingle();
    unitPrice = (f as { default_price_cents: number | null } | null)?.default_price_cents ?? null;
  }

  // CA prévisionnel = somme des devis réels (un par client) ; les stagiaires
  // sans devis comptent au tarif de la session.
  const active = quotes.filter((q) => isQuoteActive(q.status));
  const covered = active.reduce((s, q) => s + q.learnerCount, 0);
  const uncovered = Math.max(0, dossierIds.length - covered);
  const forecast = active.reduce((s, q) => s + q.subtotalCents, 0) + uncovered * (unitPrice ?? 0);
  const signed = active.filter((q) => q.status === 'signed').reduce((s, q) => s + q.subtotalCents, 0);
  const total = invoices.reduce((a, i) => a + (i.total_cents ?? 0), 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + (i.total_cents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Tarif / stagiaire" value={unitPrice != null ? `${euros(unitPrice)} HT` : '—'} />
        <Stat label="CA prévisionnel" value={`${euros(forecast)} HT`} />
        <Stat label="Devis signés" value={`${euros(signed)} HT`} />
        <Stat label="Facturé" value={euros(total)} />
        <Stat label="Encaissé" value={euros(paid)} />
      </div>

      <section className="space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Devis — un par client ({active.length})
        </p>
        {quotes.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Aucun devis encore : chaque client (entreprise ou particulier) reçoit le sien dès que son analyse du besoin
            est reçue.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {quotes.map((q) => (
              <QuoteCard key={q.id} quote={q} canManage={canManage} />
            ))}
          </div>
        )}
        {uncovered > 0 && active.length > 0 && (
          <p className="text-[12px] text-amber-700 dark:text-amber-400">
            {uncovered} stagiaire{uncovered > 1 ? 's' : ''} de la session sans devis (analyse du besoin non reçue).
          </p>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Factures</p>
        {invoices.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
            <EmptyState icon={Receipt} title="Aucune facture" description="La signature d’un devis crée sa facture brouillon." />
          </div>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800 text-[13px]">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/dossiers/${i.dossier_id}/facturation`} className="tabular-nums text-zinc-800 dark:text-zinc-200 hover:text-orange-600">
                  {i.reference.startsWith('PROV-') ? 'Brouillon' : i.reference}
                </Link>
                <span className="tabular-nums ml-auto">{euros(i.total_cents ?? 0)}</span>
                <StatusPill tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : i.status === 'issued' ? 'info' : 'neutral'}>
                  {STATUS_LABEL[i.status] ?? i.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
