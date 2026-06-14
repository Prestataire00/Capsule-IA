import { describe, it, expect } from 'vitest';
import {
  qualiopiCompletionRate,
  buildOrgKpis,
  countMissingAttendance,
  DEFAULT_ORG_KPIS,
  type VOrgKpisRow,
} from './org-kpis';

describe('qualiopiCompletionRate', () => {
  it('cas normal : (active_completed - blocking) / active_completed', () => {
    expect(qualiopiCompletionRate(10, 2)).toBeCloseTo(0.8, 10);
  });

  it('0 dossier actif/complété → 1 (rien à bloquer = 100 %)', () => {
    expect(qualiopiCompletionRate(0, 0)).toBe(1);
  });

  it('tous bloquants → 0', () => {
    expect(qualiopiCompletionRate(5, 5)).toBe(0);
  });

  it('clamp dans [0, 1] même si blocking > active_completed', () => {
    expect(qualiopiCompletionRate(3, 7)).toBe(0);
  });
});

describe('countMissingAttendance', () => {
  it('compte les lignes où signed < expected', () => {
    const rows = [
      { signed_count: 1, expected_count: 3 }, // manquant
      { signed_count: 3, expected_count: 3 }, // ok
      { signed_count: 0, expected_count: 2 }, // manquant
      { signed_count: null, expected_count: 1 }, // manquant (null → 0)
    ];
    expect(countMissingAttendance(rows)).toBe(3);
  });

  it('liste vide → 0', () => {
    expect(countMissingAttendance([])).toBe(0);
  });
});

describe('buildOrgKpis', () => {
  const row: VOrgKpisRow = {
    dossiers_active: 12,
    dossiers_closed_this_month: 4,
    dossiers_qualiopi_blocking: 2,
    dossiers_active_completed: 10,
    revenue_in_progress_cents: 350000,
    nps_avg: 8.5,
  };

  it('mappe une ligne complète', () => {
    const k = buildOrgKpis(row, 7, 3, []);
    expect(k.dossiersActive).toBe(12);
    expect(k.dossiersClosedThisMonth).toBe(4);
    expect(k.revenueInProgressCents).toBe(350000);
    expect(k.npsAvg).toBe(8.5);
    expect(k.toSign).toBe(7);
    expect(k.questionnairesPending).toBe(3);
    expect(k.qualiopiRate).toBeCloseTo(0.8, 10); // (10-2)/10
  });

  it('ligne KPI nulle (vue indisponible) → tout à 0, rate 1, nps null', () => {
    const k = buildOrgKpis(null, 0, 0, []);
    expect(k).toEqual(DEFAULT_ORG_KPIS);
    expect(k.dossiersActive).toBe(0);
    expect(k.qualiopiRate).toBe(1);
    expect(k.npsAvg).toBeNull();
  });

  it('intègre les émargements manquants depuis les lignes', () => {
    const k = buildOrgKpis(row, 0, 0, [{ signed_count: 0, expected_count: 2 }]);
    expect(k.attendanceMissing).toBe(1);
  });
});

describe('DEFAULT_ORG_KPIS', () => {
  it('est entièrement neutre (zéros, nps null)', () => {
    expect(DEFAULT_ORG_KPIS.dossiersActive).toBe(0);
    expect(DEFAULT_ORG_KPIS.toSign).toBe(0);
    expect(DEFAULT_ORG_KPIS.attendanceMissing).toBe(0);
    expect(DEFAULT_ORG_KPIS.questionnairesPending).toBe(0);
    expect(DEFAULT_ORG_KPIS.npsAvg).toBeNull();
  });
});
