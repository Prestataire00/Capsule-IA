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

export function qualiopiCompletionRate(activeCompleted: number, blocking: number): number {
  if (activeCompleted <= 0) return 1;
  const rate = (activeCompleted - blocking) / activeCompleted;
  return Math.min(1, Math.max(0, rate));
}
