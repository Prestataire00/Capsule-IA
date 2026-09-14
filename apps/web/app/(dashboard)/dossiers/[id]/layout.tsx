// ARCHETYPE: command (sous-shell d'un dossier)
// Justification: hero + tabs d'un dossier, en données réelles (RLS-scopé).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Users as UsersIcon, Banknote } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { nomDuDossier } from '@/features/dossier/referent';
import { TabsNav } from '@/shared/components/layout/tabs-nav';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { KpiCard, ACCENTS } from '@/shared/ui/kpi-card';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { DossierStatusControl } from './dossier-status-control.client';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const fmtEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' }) as Record<string, string>)[m] ?? m;

export default async function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'reference, status, modality, start_date, end_date, total_hours, total_amount_cents, ' +
        'learner:learners(first_name, last_name, email), company:companies(name), formation:formations(title)',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!data) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;

  // Référent du client (0167), lu à part et sans faire tomber la fiche si la
  // colonne n'existe pas encore sur cette base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libre = sb as unknown as SupabaseClient<any, any, any>;
  const { data: lien } = await libre
    .schema('app')
    .from('dossiers')
    .select('contact:contacts(first_name, last_name, position, email, phone)')
    .eq('id', params.id)
    .maybeSingle();
  type ContactLu = { first_name: string | null; last_name: string | null; position: string | null; email: string | null; phone: string | null };
  const brut = (lien as unknown as { contact: ContactLu | ContactLu[] | null } | null)?.contact ?? null;
  const contact = Array.isArray(brut) ? (brut[0] ?? null) : brut;
  const referent = contact
    ? {
        firstName: contact.first_name,
        lastName: contact.last_name,
        position: contact.position,
        email: contact.email,
        phone: contact.phone,
      }
    : null;
  const { nom: learner, estReferent } = nomDuDossier({
    learner: { firstName: d.learner?.first_name, lastName: d.learner?.last_name, email: d.learner?.email },
    referent,
    companyName: d.company?.name ?? null,
  });

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-7xl w-full mx-auto px-8 py-9">
        <Link
          href="/dossiers"
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tous les dossiers
        </Link>

        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <SectionLabel>Dossier</SectionLabel>
              <IdPill>{d.reference}</IdPill>
            </div>
            <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{learner}</h1>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
              <span className="font-bold text-zinc-800 dark:text-zinc-200">{d.formation?.title ?? '—'}</span>
              {d.company?.name && <span>{' · '}{d.company.name}</span>}
            </p>
            {referent && (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                {estReferent ? 'Référent du dossier' : 'Référent'} :{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {[referent.firstName, referent.lastName].filter(Boolean).join(' ')}
                </span>
                {referent.position ? ` · ${referent.position}` : ''}
                {referent.email ? ` · ${referent.email}` : ''}
                {referent.phone ? ` · ${referent.phone}` : ''}
                <span className="block text-[12px] text-zinc-400 dark:text-zinc-500">
                  Destinataire de la convention, des devis et des factures.
                  {estReferent ? ' La liste nominative des stagiaires n’est pas encore arrivée.' : ''}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DossierStatusControl dossierId={params.id} status={d.status as DossierStatus} />
            <ManageOnly section="dossiers">
              <DeleteEntityButton
                entite="dossier"
                id={params.id}
                nom={d.reference}
                article="ce dossier"
                variant="button"
                redirigerVers="/dossiers"
              />
            </ManageOnly>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" aria-label="Chiffres clés du dossier">
          <KpiCard icon={Calendar} label="Période" accent="blue">
            <span className="text-[17px] font-extrabold tabular-nums text-blue-700 dark:text-blue-300">
              {fmtDate(d.start_date)} <span className="text-blue-400 dark:text-blue-500 font-semibold">→</span> {fmtDate(d.end_date)}
            </span>
          </KpiCard>
          <KpiCard icon={Clock} label="Heures totales" accent="sky" value={`${Number(d.total_hours ?? 0)} h`} />
          <KpiCard icon={UsersIcon} label="Modalité" accent="purple">
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-bold ${ACCENTS.purple.soft}`}>
              {modalityLabel(d.modality)}
            </span>
          </KpiCard>
          <KpiCard icon={Banknote} label="Montant" accent="emerald" value={fmtEuros(d.total_amount_cents)} />
        </section>

        <TabsNav baseHref={`/dossiers/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

