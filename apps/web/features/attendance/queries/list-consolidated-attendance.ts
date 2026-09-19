import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { groupByLens, summarize } from './aggregate-consolidated';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConsolidatedSheetRow,
  ConsolidatedGroup,
  ConsolidatedSummary,
  Lens,
} from './attendance-consolidated.types';

export type ConsolidatedFilters = {
  lens: Lens;
  companyId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
};

export type ConsolidatedView = {
  groups: ConsolidatedGroup[];
  summary: ConsolidatedSummary;
};

const COLUMNS =
  'attendance_sheet_id, organization_id, dossier_id, session_id, status, ' +
  'company_id, company_name, trainer_id, trainer_name, ' +
  'session_starts_at, session_ends_at, session_hours, modality, ' +
  'expected_count, signed_count, zoom_count, manual_count, zoom_last_sync_status';

type DbRow = {
  attendance_sheet_id: string;
  organization_id: string;
  dossier_id: string;
  session_id: string;
  status: ConsolidatedSheetRow['status'];
  company_id: string | null;
  company_name: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  session_starts_at: string;
  session_ends_at: string;
  session_hours: number;
  modality: string;
  expected_count: number;
  signed_count: number;
  zoom_count: number;
  manual_count: number;
  zoom_last_sync_status: ConsolidatedSheetRow['zoomLastSyncStatus'];
};

const toRow = (r: DbRow): ConsolidatedSheetRow => ({
  attendanceSheetId: r.attendance_sheet_id,
  organizationId: r.organization_id,
  dossierId: r.dossier_id,
  sessionId: r.session_id,
  status: r.status,
  companyId: r.company_id,
  companyName: r.company_name,
  trainerId: r.trainer_id,
  trainerName: r.trainer_name,
  sessionStartsAt: r.session_starts_at,
  sessionEndsAt: r.session_ends_at,
  sessionHours: Number(r.session_hours),
  modality: r.modality,
  expectedCount: r.expected_count,
  signedCount: r.signed_count,
  zoomCount: r.zoom_count,
  manualCount: r.manual_count,
  zoomLastSyncStatus: r.zoom_last_sync_status,
});

export async function listConsolidatedAttendance(
  filters: ConsolidatedFilters,
  now: Date = new Date(),
): Promise<ConsolidatedView> {
  // `attendance_consolidated` est une vue absente des types générés : on lit
  // par un client non typé plutôt que de faire croire à une table connue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseServer() as unknown as SupabaseClient<any, any, any>;
  let q = sb.schema('app').from('attendance_consolidated').select(COLUMNS);
  if (filters.companyId) q = q.eq('company_id', filters.companyId);
  if (filters.from) q = q.gte('session_starts_at', filters.from);
  if (filters.to) q = q.lte('session_starts_at', filters.to);

  const { data, error } = await q;
  if (error) throw new Error(`consolidated_attendance_query_failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as DbRow[]).map(toRow);
  return {
    groups: groupByLens(rows, filters.lens),
    summary: summarize(rows, now),
  };
}
