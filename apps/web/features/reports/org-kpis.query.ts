import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import {
  buildOrgKpis,
  type OrgKpis,
  type VOrgKpisRow,
  type AttendanceCountRow,
} from './org-kpis';

// Résilience : la home dépend de ces KPIs mais ne doit JAMAIS tomber (500
// global) si une source manque — ex. drift de schéma où app.v_org_kpis n'est
// pas encore migrée en prod. Chaque source en erreur est journalisée
// (console.error, pas d'avalement silencieux) et dégrade vers une valeur neutre.
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
  let kpisRow: VOrgKpisRow | null = null;
  if (kpisRes.error) {
    console.error(`[org-kpis] v_org_kpis indisponible — KPIs dégradés: ${kpisRes.error.message}`);
  } else {
    kpisRow = (kpisRes.data as VOrgKpisRow | null) ?? null;
  }

  // Documents à signer : signatures en attente.
  const toSignRes = await sb
    .schema('app')
    .from('document_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  let toSign = 0;
  if (toSignRes.error) {
    console.error(`[org-kpis] document_signatures indisponible — 0: ${toSignRes.error.message}`);
  } else {
    toSign = toSignRes.count ?? 0;
  }

  // Questionnaires à compléter : assignations en attente ou en cours.
  // NB: le statut est porté par questionnaire_assignments (une réponse =
  // soumission, sans statut). questionnaire_responses n'a pas de colonne status.
  const questionnairesRes = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'in_progress']);
  let questionnairesPending = 0;
  if (questionnairesRes.error) {
    console.error(`[org-kpis] questionnaire_assignments indisponible — 0: ${questionnairesRes.error.message}`);
  } else {
    questionnairesPending = questionnairesRes.count ?? 0;
  }

  // Émargements manquants : feuilles non finalisées dont signed_count < expected_count.
  const attendanceRes = await sb
    .schema('app')
    .from('attendance_consolidated' as never)
    .select('signed_count, expected_count')
    .neq('status', 'finalized');
  let attendanceRows: AttendanceCountRow[] = [];
  if (attendanceRes.error) {
    console.error(`[org-kpis] attendance_consolidated indisponible — 0: ${attendanceRes.error.message}`);
  } else {
    attendanceRows = (attendanceRes.data as AttendanceCountRow[] | null) ?? [];
  }

  return buildOrgKpis(kpisRow, toSign, questionnairesPending, attendanceRows);
}
