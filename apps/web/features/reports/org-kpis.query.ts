import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { qualiopiCompletionRate, type OrgKpis } from './org-kpis';

type VOrgKpisRow = {
  dossiers_active: number | null;
  dossiers_closed_this_month: number | null;
  dossiers_qualiopi_blocking: number | null;
  dossiers_active_completed: number | null;
  revenue_in_progress_cents: number | null;
  nps_avg: number | null;
};

type AttendanceCountRow = {
  signed_count: number | null;
  expected_count: number | null;
};

export async function getOrgKpis(
  sb: ReturnType<typeof supabaseServer>,
): Promise<OrgKpis> {
  // Vue live (RLS héritée) : 0 ou 1 ligne pour l'org du JWT.
  const kpisRes = await sb
    .schema('app')
    .from('v_org_kpis' as never)
    .select(
      'dossiers_active, dossiers_closed_this_month, dossiers_qualiopi_blocking, dossiers_active_completed, revenue_in_progress_cents, nps_avg',
    )
    .maybeSingle();
  if (kpisRes.error) {
    throw new Error(`org_kpis_query_failed: ${kpisRes.error.message}`);
  }
  const kpis = (kpisRes.data as VOrgKpisRow | null) ?? {
    dossiers_active: 0,
    dossiers_closed_this_month: 0,
    dossiers_qualiopi_blocking: 0,
    dossiers_active_completed: 0,
    revenue_in_progress_cents: 0,
    nps_avg: null,
  };

  // Documents à signer : signatures en attente.
  const toSignRes = await sb
    .schema('app')
    .from('document_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (toSignRes.error) {
    throw new Error(`org_kpis_to_sign_failed: ${toSignRes.error.message}`);
  }

  // Questionnaires à traiter : en attente ou en cours.
  const questionnairesRes = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'in_progress']);
  if (questionnairesRes.error) {
    throw new Error(`org_kpis_questionnaires_failed: ${questionnairesRes.error.message}`);
  }

  // Émargements manquants : feuilles non finalisées dont signed_count < expected_count.
  // PostgREST ne sait pas comparer deux colonnes entre elles → filtrage côté TS.
  const attendanceRes = await sb
    .schema('app')
    .from('attendance_consolidated' as never)
    .select('signed_count, expected_count')
    .neq('status', 'finalized');
  if (attendanceRes.error) {
    throw new Error(`org_kpis_attendance_failed: ${attendanceRes.error.message}`);
  }
  const attendanceRows = (attendanceRes.data as AttendanceCountRow[] | null) ?? [];
  const attendanceMissing = attendanceRows.filter(
    (r) => (r.signed_count ?? 0) < (r.expected_count ?? 0),
  ).length;

  return {
    dossiersActive: kpis.dossiers_active ?? 0,
    dossiersClosedThisMonth: kpis.dossiers_closed_this_month ?? 0,
    qualiopiRate: qualiopiCompletionRate(
      kpis.dossiers_active_completed ?? 0,
      kpis.dossiers_qualiopi_blocking ?? 0,
    ),
    revenueInProgressCents: kpis.revenue_in_progress_cents ?? 0,
    npsAvg: kpis.nps_avg,
    toSign: toSignRes.count ?? 0,
    attendanceMissing,
    questionnairesPending: questionnairesRes.count ?? 0,
  };
}
