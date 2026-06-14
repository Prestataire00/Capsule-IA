import { describe, it, expect } from 'vitest';
import { computeSyncWindow, ZOOM_RETENTION_DAYS, MIN_SETTLE_MINUTES } from './zoom-sync-window';

describe('computeSyncWindow', () => {
  it('borne haute = now - délai de stabilisation', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const w = computeSyncWindow(now);
    expect(MIN_SETTLE_MINUTES).toBe(30);
    expect(w.cutoffIso).toBe('2026-06-30T11:30:00.000Z');
  });

  it('borne basse = now - rétention Zoom', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const w = computeSyncWindow(now);
    expect(ZOOM_RETENTION_DAYS).toBe(25);
    expect(w.floorIso).toBe('2026-06-05T12:00:00.000Z');
  });

  it('floor est antérieur à cutoff', () => {
    const w = computeSyncWindow(new Date('2026-06-30T12:00:00.000Z'));
    expect(new Date(w.floorIso).getTime()).toBeLessThan(new Date(w.cutoffIso).getTime());
  });
});
