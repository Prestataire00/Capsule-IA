// ARCHETYPE: workflow
// Justification: dépôt d'une facture faite ailleurs — PDF, montants, séances concernées.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { seancesFacturables } from '@/features/trainer-space/billing';
import { dayKey } from '@/features/trainer-space/dates';
import { DepositInvoiceForm, type OrganismeDepot } from './deposit-form';

export const dynamic = 'force-dynamic';

const dateCourte = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium' }).format(new Date(iso));

export default async function DeposerFacturePage() {
  const sb = supabaseServer();
  const [{ data: { user } }, memberships] = await Promise.all([sb.auth.getUser(), new SupabaseMembershipReader(sb as never).list()]);
  if (!user) return null;

  const organismes: OrganismeDepot[] = [];
  for (const m of memberships) {
    const f = await seancesFacturables(user.id, m.organizationId as string);
    if (!f) continue;
    const seances = [
      ...f.lignes.map((l) => ({ id: l.sessionId, label: l.label, attenduCents: l.totalCents })),
      ...f.sansTarif.map((s) => ({ id: s.id, label: `${s.title} — séance du ${dateCourte(s.startsAt)}`, attenduCents: null })),
    ];
    organismes.push({ id: m.organizationId as string, nom: m.organizationName, seances });
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <Link href="/mes-factures" className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="w-3 h-3" /> Mes factures
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Déposer une facture</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Votre facture faite avec votre propre logiciel : joignez le PDF et indiquez les séances concernées.
        </p>
      </header>
      <DepositInvoiceForm organismes={organismes} aujourdhui={dayKey(new Date())} />
    </div>
  );
}
