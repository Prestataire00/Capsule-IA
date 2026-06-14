export type OrgKpis = {
  dossiersActive: number;
  dossiersClosedThisMonth: number;
  qualiopiRate: number;
  revenueInProgressCents: number;
  npsAvg: number | null;
  toSign: number;
  attendanceMissing: number;
  questionnairesPending: number;
};

// Ligne brute de la vue app.v_org_kpis (0 ou 1 par org).
export type VOrgKpisRow = {
  dossiers_active: number | null;
  dossiers_closed_this_month: number | null;
  dossiers_qualiopi_blocking: number | null;
  dossiers_active_completed: number | null;
  revenue_in_progress_cents: number | null;
  nps_avg: number | null;
};

export type AttendanceCountRow = {
  signed_count: number | null;
  expected_count: number | null;
};

export function qualiopiCompletionRate(activeCompleted: number, blocking: number): number {
  if (activeCompleted <= 0) return 1;
  const rate = (activeCompleted - blocking) / activeCompleted;
  return Math.min(1, Math.max(0, rate));
}

// Émargements manquants : feuilles non finalisées dont signed_count < expected_count.
// (PostgREST ne compare pas deux colonnes entre elles → calcul côté TS.)
export function countMissingAttendance(rows: AttendanceCountRow[]): number {
  return rows.filter((r) => (r.signed_count ?? 0) < (r.expected_count ?? 0)).length;
}

// Mapping pur ligne(s) brutes → KPIs. `kpis = null` (vue indisponible / 0 ligne)
// dégrade proprement vers des valeurs neutres au lieu de planter la home.
export function buildOrgKpis(
  kpis: VOrgKpisRow | null,
  toSign: number,
  questionnairesPending: number,
  attendanceRows: AttendanceCountRow[],
): OrgKpis {
  return {
    dossiersActive: kpis?.dossiers_active ?? 0,
    dossiersClosedThisMonth: kpis?.dossiers_closed_this_month ?? 0,
    qualiopiRate: qualiopiCompletionRate(
      kpis?.dossiers_active_completed ?? 0,
      kpis?.dossiers_qualiopi_blocking ?? 0,
    ),
    revenueInProgressCents: kpis?.revenue_in_progress_cents ?? 0,
    npsAvg: kpis?.nps_avg ?? null,
    toSign,
    attendanceMissing: countMissingAttendance(attendanceRows),
    questionnairesPending,
  };
}

// KPIs entièrement neutres — utilisé si toutes les sources sont indisponibles.
export const DEFAULT_ORG_KPIS: OrgKpis = buildOrgKpis(null, 0, 0, []);
