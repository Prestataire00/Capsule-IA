// Fenêtre de sessions éligibles au backfill Zoom :
// terminées il y a > MIN_SETTLE_MINUTES (le rapport Zoom est prêt)
// et < ZOOM_RETENTION_DAYS (encore dans la rétention Zoom).
export const ZOOM_RETENTION_DAYS = 25;
export const MIN_SETTLE_MINUTES = 30;

export type SyncWindow = { floorIso: string; cutoffIso: string };

export function computeSyncWindow(now: Date): SyncWindow {
  const cutoff = new Date(now.getTime() - MIN_SETTLE_MINUTES * 60_000);
  const floor = new Date(now.getTime() - ZOOM_RETENTION_DAYS * 86_400_000);
  return { floorIso: floor.toISOString(), cutoffIso: cutoff.toISOString() };
}
