export type DossierHours = {
  hours_planned: number;
  hours_attended: number;
  attendance_rate: number;
  at_risk: boolean;
} | null;

export type LearnerDossier = {
  id: string;
  reference: string;
  status: string;
  modality: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  total_amount_cents: number | null;
  formationTitle: string | null;
  hours: DossierHours;
};

export type LearnerSummary = {
  formationsCount: number;
  hoursAttended: number;
  hoursPlanned: number;
  avgAttendanceRate: number;
  atRiskCount: number;
};

/** Les embeds PostgREST renvoient parfois un tableau, parfois un objet (relation 1-1). */
export function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length > 0 ? (value[0] as T) : null;
  return value;
}

export function buildLearnerSummary(dossiers: LearnerDossier[]): LearnerSummary {
  let hoursAttended = 0;
  let hoursPlanned = 0;
  let atRiskCount = 0;
  const rates: number[] = [];

  for (const d of dossiers) {
    if (d.hours) {
      hoursAttended += d.hours.hours_attended;
      hoursPlanned += d.hours.hours_planned;
      if (d.hours.at_risk) atRiskCount += 1;
      rates.push(d.hours.attendance_rate);
    }
  }

  const avgAttendanceRate =
    rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return {
    formationsCount: dossiers.length,
    hoursAttended,
    hoursPlanned,
    avgAttendanceRate,
    atRiskCount,
  };
}
