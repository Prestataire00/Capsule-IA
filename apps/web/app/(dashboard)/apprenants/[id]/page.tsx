// ARCHETYPE: command
// Justification: fiche détail apprenant en données réelles (RLS-scopé), hub vers les dossiers.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FolderOpen, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { ClientFormationsSection } from '@/features/formations/ui/client-formations-section';
import { LearnerHeader } from './learner-header';
import { DossierCard } from './dossier-card';
import { buildLearnerSummary, normalizeOne, type LearnerDossier } from './summary';

const OWNER_ADMIN = ['owner', 'admin'];

export default async function ApprenantDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: learnerRow } = await sb
    .schema('app')
    .from('learners')
    .select(
      'id, first_name, last_name, email, phone, position, statut, rqth, accessibility_notes, ' +
        'anonymized_at, company:companies(name)',
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!learnerRow) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lr = learnerRow as any;

  const { data: dossierRows } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, status, modality, start_date, end_date, total_hours, total_amount_cents, ' +
        'formation:formations(title), hours:dossier_hours_tracking(hours_planned, hours_attended, attendance_rate, at_risk)',
    )
    .eq('learner_id', params.id)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  const dossiers: LearnerDossier[] = ((dossierRows ?? []) as unknown[]).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = row as any;
    const formation = normalizeOne(d.formation) as { title: string } | null;
    const hours = normalizeOne(d.hours) as LearnerDossier['hours'];
    return {
      id: d.id,
      reference: d.reference,
      status: d.status,
      modality: d.modality,
      start_date: d.start_date,
      end_date: d.end_date,
      total_hours: Number(d.total_hours ?? 0),
      total_amount_cents: d.total_amount_cents ?? null,
      formationTitle: formation?.title ?? null,
      hours: hours
        ? {
            hours_planned: Number(hours.hours_planned),
            hours_attended: Number(hours.hours_attended),
            attendance_rate: Number(hours.attendance_rate),
            at_risk: Boolean(hours.at_risk),
          }
        : null,
    };
  });

  const summary = buildLearnerSummary(dossiers);
  const member = await getCurrentMember();
  const isOwnerAdmin = !!member && OWNER_ADMIN.includes(member.role);

  const company = normalizeOne(lr.company) as { name: string } | null;

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-9">
        <Link
          href="/apprenants"
          className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Tous les apprenants
        </Link>

        {lr.anonymized_at && (
          <p className="mb-6 text-[13px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
            Cet apprenant a été anonymisé (RGPD). Les données personnelles ont été effacées ; seules les preuves légales pseudonymisées subsistent.
          </p>
        )}

        <LearnerHeader
          learner={{
            id: lr.id,
            first_name: lr.first_name,
            last_name: lr.last_name,
            email: lr.email,
            phone: lr.phone,
            position: lr.position,
            statut: lr.statut,
            rqth: lr.rqth,
            accessibility_notes: lr.accessibility_notes,
            anonymized_at: lr.anonymized_at,
            companyName: company?.name ?? null,
          }}
          summary={summary}
          isOwnerAdmin={isOwnerAdmin}
        />

        {/* BtoC : ce particulier peut avoir ses propres formations, hors catalogue. */}
        <ClientFormationsSection
          clientKind="individual"
          clientId={lr.id}
          clientName={`${lr.first_name} ${lr.last_name}`.trim()}
        />

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
                <FolderOpen className="w-4 h-4" />
              </span>
              Formations &amp; dossiers
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.orange.soft}`}>{dossiers.length}</span>
            </h2>
            {/* Assiduité de cet apprenant, demi-journée par demi-journée,
                absences et demi-journées non émargées comprises. */}
            <a
              href={`/api/emargements/export.csv?learnerId=${params.id}`}
              className="text-[12px] font-semibold px-3 h-8 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Émargements (CSV)
            </a>
          </div>
          {dossiers.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Aucun dossier pour cet apprenant."
              description="Créez un dossier pour le rattacher à une formation."
              action={
                <Link
                  href={`/dossiers/nouveau?learnerId=${lr.id}`}
                  className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
                >
                  Nouveau dossier
                </Link>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dossiers.map((d) => (
                <li key={d.id}>
                  <DossierCard dossier={d} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
