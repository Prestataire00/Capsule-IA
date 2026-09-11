// ARCHETYPE: workflow
// Justification: facture calculée depuis les séances terminées et le tarif de l'organisme — vérifier puis envoyer.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { loadBillingProfile, profilComplet, seancesFacturables } from '@/features/trainer-space/billing';
import { MENTION_FRANCHISE, TARIF_BASES, formatEuros, totaux } from '@/features/trainer-space/billing-rules';
import { jourLong } from '@/features/trainer-space/dates';
import { GenerateInvoiceButton } from './generate-button';

export const dynamic = 'force-dynamic';

const qte = (q: number) => q.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export default async function NouvelleFacturePage({ searchParams }: { searchParams: { org?: string } }) {
  const sb = supabaseServer();
  const [{ data: { user } }, memberships] = await Promise.all([sb.auth.getUser(), new SupabaseMembershipReader(sb as never).list()]);
  if (!user) return null;
  const org = memberships.find((m) => m.organizationId === searchParams.org) ?? (memberships.length === 1 ? memberships[0] : undefined);
  if (!org) notFound();

  const [profil, facturable] = await Promise.all([loadBillingProfile(user.id), seancesFacturables(user.id, org.organizationId as string)]);
  if (!facturable) notFound();
  const { fiche, lignes, sansTarif } = facturable;
  const regime = profil?.vat_regime ?? 'franchise';
  const t = totaux(lignes, regime, Number(profil?.vat_rate ?? 0));
  const base = TARIF_BASES.find((b) => b.value === fiche.tarif_base);
  const complet = profilComplet(profil);

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <Link href="/mes-factures" className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="w-3 h-3" /> Mes factures
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Ma facture pour {org.organizationName}</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {base && fiche.tarif_cents != null
            ? `Tarif fixé par l’organisme : ${formatEuros(fiche.tarif_cents)} HT ${base.label.toLowerCase()}.`
            : 'L’organisme n’a pas encore fixé votre tarif sur votre fiche.'}
        </p>
      </header>

      {!complet && (
        <p className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 rounded-lg px-3 py-2.5">
          Complétez votre <Link href="/profil-facturation" className="underline">profil de facturation</Link> pour générer la facture.
        </p>
      )}

      {lignes.length === 0 ? (
        <p className="text-[13px] text-zinc-500 text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          Aucune séance terminée à facturer pour cet organisme.
        </p>
      ) : (
        <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {lignes.map((l) => (
              <li key={l.sessionId} className="px-4 py-2.5 flex items-start justify-between gap-3 text-[13px]">
                <span className="text-zinc-800 dark:text-zinc-200">{l.label}</span>
                <span className="text-right tabular-nums flex-shrink-0">
                  <span className="block text-zinc-900 dark:text-zinc-100">{formatEuros(l.totalCents)}</span>
                  <span className="block text-[11px] text-zinc-500">
                    {qte(l.quantity)} {l.unit} × {formatEuros(l.unitPriceCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <dl className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/60 text-[13px] space-y-1 tabular-nums">
            <div className="flex justify-between"><dt className="text-zinc-500">Total HT</dt><dd>{formatEuros(t.subtotalCents)}</dd></div>
            {regime === 'assujetti' ? (
              <div className="flex justify-between"><dt className="text-zinc-500">TVA {Number(profil?.vat_rate ?? 0)} %</dt><dd>{formatEuros(t.vatCents)}</dd></div>
            ) : (
              <p className="text-[11px] text-zinc-500">{MENTION_FRANCHISE}</p>
            )}
            <div className="flex justify-between font-medium text-zinc-900 dark:text-zinc-100"><dt>Net à payer</dt><dd>{formatEuros(t.totalCents)}</dd></div>
          </dl>
        </section>
      )}

      {sansTarif.length > 0 && (
        <p className="text-[12px] text-zinc-500">
          {sansTarif.length} séance{sansTarif.length > 1 ? 's' : ''} sans tarif ({sansTarif.map((s) => jourLong(s.startsAt)).join(', ')}) : demandez à l’organisme de
          renseigner votre tarif, ou <Link href="/mes-factures/deposer" className="underline">déposez votre facture</Link>.
        </p>
      )}

      {lignes.length > 0 && <GenerateInvoiceButton organizationId={org.organizationId as string} disabled={!complet} />}
    </div>
  );
}
