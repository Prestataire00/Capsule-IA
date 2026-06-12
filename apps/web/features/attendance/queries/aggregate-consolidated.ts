import type {
  ConsolidatedSheetRow,
  ConsolidatedGroup,
  ConsolidatedSummary,
  Lens,
} from './attendance-consolidated.types';

export const ZOOM_RETENTION_DAYS = 25;

const groupKeyAndLabel = (
  row: ConsolidatedSheetRow,
  lens: Lens,
): { key: string; label: string } => {
  if (lens === 'session') {
    return { key: row.attendanceSheetId, label: row.companyName ?? 'Session' };
  }
  if (lens === 'company') {
    return row.companyId
      ? { key: row.companyId, label: row.companyName ?? 'Entreprise' }
      : { key: 'none', label: 'Sans entreprise' };
  }
  return row.trainerId
    ? { key: row.trainerId, label: row.trainerName ?? 'Formateur' }
    : { key: 'none', label: 'Sans formateur' };
};

export const groupByLens = (
  rows: readonly ConsolidatedSheetRow[],
  lens: Lens,
): ConsolidatedGroup[] => {
  const map = new Map<string, ConsolidatedGroup>();
  for (const row of rows) {
    const { key, label } = groupKeyAndLabel(row, lens);
    const g = map.get(key) ?? {
      key,
      label,
      sheetCount: 0,
      expectedCount: 0,
      signedCount: 0,
      missingCount: 0,
      zoomCount: 0,
      manualCount: 0,
      hasSyncError: false,
    };
    g.sheetCount += 1;
    g.expectedCount += row.expectedCount;
    g.signedCount += row.signedCount;
    g.missingCount += Math.max(0, row.expectedCount - row.signedCount);
    g.zoomCount += row.zoomCount;
    g.manualCount += row.manualCount;
    if (row.zoomLastSyncStatus === 'error') g.hasSyncError = true;
    map.set(key, g);
  }
  return [...map.values()];
};

const isIncomplete = (row: ConsolidatedSheetRow): boolean =>
  row.status !== 'finalized' && row.signedCount < row.expectedCount;

const daysSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 86_400_000;

export const summarize = (
  rows: readonly ConsolidatedSheetRow[],
  now: Date,
): ConsolidatedSummary => {
  let expected = 0;
  let signed = 0;
  let zoom = 0;
  let incompleteSheets = 0;
  let syncErrors = 0;
  let hoursAtRiskRecoverable = 0;
  let hoursAtRiskLost = 0;

  for (const row of rows) {
    expected += row.expectedCount;
    signed += row.signedCount;
    zoom += row.zoomCount;
    if (row.zoomLastSyncStatus === 'error') syncErrors += 1;
    if (isIncomplete(row)) {
      incompleteSheets += 1;
      if (daysSince(row.sessionEndsAt, now) <= ZOOM_RETENTION_DAYS) {
        hoursAtRiskRecoverable += row.sessionHours;
      } else {
        hoursAtRiskLost += row.sessionHours;
      }
    }
  }

  return {
    incompleteSheets,
    signatureRate: expected > 0 ? signed / expected : 0,
    zoomCoverage: signed > 0 ? zoom / signed : 0,
    syncErrors,
    hoursAtRiskRecoverable,
    hoursAtRiskLost,
  };
};
