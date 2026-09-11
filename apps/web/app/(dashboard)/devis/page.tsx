// ARCHETYPE: command
// Justification: pipeline des devis de l'organisme (un par client), à relire puis envoyer.
import Link from 'next/link';
import { Building2, FileSignature, Sparkles, User } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { QUOTE_STATUS_LABELS, type QuoteStatus } from '@/features/billing/domain/quote';
import { listQuotes } from '@/features/billing/quotes/queries';
import { expireOverdueQuotes } from '@/features/billing/quotes/quote-service';
import { QUOTE_STATUS_TONE, formatDate, formatEuros } from './_components/labels';

export const dynamic = 'force-dynamic';

const FILTERS: Array<{ value: QuoteStatus | null; label: string }> = [
  { value: null, label: 'Tous' },
  { value: 'draft', label: 'À relire' },
  { value: 'sent', label: 'Envoyés' },
  { value: 'signed', label: 'Signés' },
  { value: 'refused', label: 'Refusés' },
  { value: 'expired', label: 'Expirés' },
  { value: 'cancelled', label: 'Annulés' },
];

export default async function DevisPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireAccess('billing');
  const me = await getCurrentMember();
  if (!me) return null;

  const sb = supabaseAdmin() as unknown as SupabaseClient;
  await expireOverdueQuotes(sb);
  const all = await listQuotes(sb, me.organizationId, null);
  const status = FILTERS.some((f) => f.value === searchParams.status) ? (searchParams.status as QuoteStatus) : null;
  const quotes = status ? all.filter((q) => q.status === status) : all;

  const drafts = all.filter((q) => q.status === 'draft');
  const sent = all.filter((q) => q.status === 'sent');
  const signed = all.filter((q) => q.status === 'signed');
  const closed = all.filter((q) => ['signed', 'refused', 'expired'].includes(q.status)).length;
  const sum = (list: typeof all) => list.reduce((s, q) => s + q.subtotalCents, 0);

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Gestion commerciale</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Devis</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
          Un devis par client — une entreprise pour tous ses stagiaires d’une session, ou un particulier. Il s’établit
          automatiquement au tarif de la session dès que la session est planifiée et l’analyse du besoin reçue ; vous le
          relisez, puis « Valider et envoyer » l’adresse au client pour signature. La signature crée la facture.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="À relire" value={drafts.length} hint={formatEuros(sum(drafts)) + ' HT'} />
        <StatCard label="En attente de signature" value={sent.length} hint={formatEuros(sum(sent)) + ' HT'} />
        <StatCard label="Signés" value={signed.length} hint={formatEuros(sum(signed)) + ' HT'} />
        <StatCard
          label="Taux de signature"
          value={closed ? `${Math.round((signed.length / closed) * 100)} %` : '—'}
          hint={`${closed} devis clôturé${closed > 1 ? 's' : ''}`}
        />
      </section>

      <nav className="flex flex-wrap items-center gap-1.5 mb-5">
        {FILTERS.map((f) => {
          const active = f.value === status;
          const count = f.value ? all.filter((q) => q.status === f.value).length : all.length;
          return (
            <Link
              key={f.label}
              href={f.value ? `/devis?status=${f.value}` : '/devis'}
              className={`text-[13px] px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200/70 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Aucun devis"
          description="Les devis apparaissent ici dès qu’un dossier a sa session planifiée et son analyse du besoin reçue."
        />
      ) : (
        <div className="overflow-x-auto">
          <ul className="min-w-[860px] border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/devis/${q.id}`}
                  className="grid grid-cols-[130px_1fr_1fr_110px_100px_110px] gap-3 py-3 px-2 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                >
                  <span className="tabular-nums text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1">
                    {q.reference}
                    {q.autoGenerated && q.status === 'draft' && (
                      <Sparkles className="w-3 h-3 text-orange-500" aria-label="Établi automatiquement" />
                    )}
                  </span>
                  <span className="min-w-0 flex items-center gap-1.5">
                    {q.clientKind === 'company' ? (
                      <Building2 className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                    ) : (
                      <User className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                    )}
                    <span className="truncate text-zinc-800 dark:text-zinc-200">{q.clientName}</span>
                    <span className="text-[11px] text-zinc-400 shrink-0">
                      {q.clientKind === 'company' ? `${q.learnerCount} stag.` : 'particulier'}
                    </span>
                  </span>
                  <span className="truncate text-zinc-500 dark:text-zinc-400">{q.object}</span>
                  <span className="tabular-nums text-right text-zinc-900 dark:text-zinc-100">{formatEuros(q.totalCents)}</span>
                  <span className="tabular-nums text-[12px] text-zinc-500">{formatDate(q.validUntil)}</span>
                  <span className="text-right">
                    <StatusPill tone={QUOTE_STATUS_TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</StatusPill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
