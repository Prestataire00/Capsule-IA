// ARCHETYPE: workflow
// Justification: relecture et modification d'un devis, puis envoi au client pour signature.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, User } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { StatusPill } from '@/shared/ui/status-pill';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadOrgVat } from '@/features/formations/load-org-vat';
import { QUOTE_STATUS_LABELS, computeQuoteTotals } from '@/features/billing/domain/quote';
import { loadQuoteDetail } from '@/features/billing/quotes/queries';
import { QuoteEditor, type EditorInitial } from '../_components/quote-editor.client';
import { QuoteSideActions } from '../_components/quote-side-actions.client';
import { QUOTE_STATUS_TONE, formatDate, formatEuros } from '../_components/labels';

export const dynamic = 'force-dynamic';

const SIGNATURE_LABELS: Record<string, string> = {
  pending: 'en attente',
  signed: 'signé',
  declined: 'refusé',
  expired: 'lien désactivé',
};

const toEuros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export default async function DevisDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('billing');
  const me = await getCurrentMember();
  if (!me) notFound();
  const canManage = can(me.role, 'billing') === 'manage';

  const sb = supabaseAdmin() as unknown as SupabaseClient;
  const [detail, orgVat] = await Promise.all([loadQuoteDetail(sb, params.id, me.organizationId), loadOrgVat()]);
  if (!detail) notFound();
  const { quote, summary, lines, dossiers, signatures } = detail;

  const initial: EditorInitial = {
    object: quote.object,
    notes: quote.notes ?? '',
    validUntil: quote.valid_until,
    vatRate: String(Number(quote.vat_rate)),
    recipientName: quote.recipient_name ?? '',
    recipientEmail: quote.recipient_email ?? '',
    lines: lines.map((l) => ({
      description: l.description,
      details: l.details ?? '',
      quantity: String(l.quantity).replace('.', ','),
      unitEuros: toEuros(l.unit_amount_cents),
      vatRate: l.vat_rate == null ? '' : String(l.vat_rate),
    })),
  };
  const totals = computeQuoteTotals(
    lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitAmountCents: l.unit_amount_cents,
      vatRate: l.vat_rate,
    })),
    Number(quote.vat_rate),
  );

  const backHref = dossiers.length === 1 && dossiers[0] ? `/dossiers/${dossiers[0].id}/facturation` : '/devis';
  const editable = canManage && quote.status === 'draft';

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <Link
        href={backHref}
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {backHref === '/devis' ? 'Tous les devis' : 'Retour au dossier'}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <SectionLabel className="mb-1">Devis</SectionLabel>
          <h1 className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
            {quote.reference}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 inline-flex items-center gap-1.5">
            {quote.client_kind === 'company' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            {summary.clientName} · {quote.client_kind === 'company' ? 'entreprise' : 'particulier'} · établi le{' '}
            {formatDate(quote.issued_on)}
          </p>
        </div>
        <StatusPill tone={QUOTE_STATUS_TONE[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</StatusPill>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="min-w-0 space-y-4">
          {quote.status === 'draft' && !editable && (
            <p className="text-[12px] text-zinc-500">Lecture seule : la modification des devis est réservée à la gestion de la facturation.</p>
          )}
          {quote.status !== 'draft' && canManage && (quote.status === 'sent' || quote.status === 'expired') && (
            <p className="text-[12px] text-zinc-500">
              Devis figé depuis son envoi. Pour le modifier, remettez-le en brouillon (le lien envoyé sera désactivé).
            </p>
          )}

          {editable ? (
            <QuoteEditor
              quoteId={quote.id}
              reference={quote.reference}
              initial={initial}
              vatExempt={orgVat.regime === 'exempt'}
            />
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
              <p className="text-[13px] text-zinc-900 dark:text-zinc-100 mb-3">{quote.object}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                      <th className="pb-2 font-normal">Désignation</th>
                      <th className="pb-2 font-normal text-center">Qté</th>
                      <th className="pb-2 font-normal text-right">PU HT</th>
                      <th className="pb-2 font-normal text-right">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-2">
                          {l.description}
                          {l.details && <span className="block text-[11px] text-zinc-500">{l.details}</span>}
                        </td>
                        <td className="py-2 text-center tabular-nums">{l.quantity}</td>
                        <td className="py-2 text-right tabular-nums">{formatEuros(l.unit_amount_cents)}</td>
                        <td className="py-2 text-right tabular-nums">{formatEuros(Math.round(l.quantity * l.unit_amount_cents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-right text-[13px] tabular-nums mt-3 text-zinc-900 dark:text-zinc-100">
                Total {totals.vatCents === 0 ? 'net' : 'TTC'} : {formatEuros(totals.totalCents)}
              </p>
              {quote.notes && <p className="text-[12px] text-zinc-500 mt-3 whitespace-pre-line">{quote.notes}</p>}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4">
            <QuoteSideActions
              quoteId={quote.id}
              reference={quote.reference}
              status={quote.status}
              recipientEmail={quote.recipient_email}
              documentId={quote.document_id}
              invoice={summary.invoice}
              canManage={canManage}
            />
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 text-[13px] space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Récapitulatif</p>
            <p className="flex justify-between"><span className="text-zinc-500">Total HT</span><span className="tabular-nums">{formatEuros(totals.subtotalCents)}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">{totals.vatCents === 0 ? 'Total net' : 'Total TTC'}</span><span className="tabular-nums font-medium">{formatEuros(totals.totalCents)}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">Validité</span><span className="tabular-nums">{formatDate(quote.valid_until)}</span></p>
            <p className="flex justify-between gap-2"><span className="text-zinc-500">Destinataire</span><span className="truncate">{quote.recipient_email ?? '—'}</span></p>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 text-[13px]">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              Stagiaire{dossiers.length > 1 ? 's' : ''} couvert{dossiers.length > 1 ? 's' : ''} ({dossiers.length})
            </p>
            <ul className="space-y-1">
              {dossiers.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span className="truncate">{d.learnerName}</span>
                  <Link href={`/dossiers/${d.id}`} className="tabular-nums text-[12px] text-zinc-500 hover:text-orange-600">
                    {d.reference}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {signatures.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 text-[13px]">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Suivi de signature</p>
              <ul className="space-y-1.5">
                {signatures.map((s, i) => (
                  <li key={i} className="text-[12px]">
                    <span className="text-zinc-800 dark:text-zinc-200">{s.signerEmail ?? s.signerName}</span>
                    <span className="block text-zinc-500">
                      envoyé le {formatDate(s.createdAt)} · {SIGNATURE_LABELS[s.status] ?? s.status}
                      {s.signedAt ? ` le ${formatDate(s.signedAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
