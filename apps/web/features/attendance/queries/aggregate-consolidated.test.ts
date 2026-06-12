import { describe, it, expect } from 'vitest';
import { groupByLens, summarize, ZOOM_RETENTION_DAYS } from './aggregate-consolidated';
import type { ConsolidatedSheetRow } from './attendance-consolidated.types';

const base: ConsolidatedSheetRow = {
  attendanceSheetId: 'sh1',
  organizationId: 'org1',
  dossierId: 'dos1',
  sessionId: 'ses1',
  status: 'open',
  companyId: 'comp1',
  companyName: 'Client Alpha',
  trainerId: 'tr1',
  trainerName: 'Marie Tut',
  sessionStartsAt: '2026-06-01T09:00:00.000Z',
  sessionEndsAt: '2026-06-01T12:00:00.000Z',
  sessionHours: 3,
  modality: 'distanciel',
  expectedCount: 4,
  signedCount: 2,
  zoomCount: 1,
  manualCount: 1,
  zoomLastSyncStatus: null,
};

describe('groupByLens', () => {
  it('lens=company agrège les feuilles d\'une même entreprise', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, attendanceSheetId: 'sh1', expectedCount: 4, signedCount: 2, zoomCount: 1, manualCount: 1 },
      { ...base, attendanceSheetId: 'sh2', expectedCount: 3, signedCount: 3, zoomCount: 3, manualCount: 0 },
    ];
    const groups = groupByLens(rows, 'company');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'comp1',
      label: 'Client Alpha',
      sheetCount: 2,
      expectedCount: 7,
      signedCount: 5,
      missingCount: 2,
      zoomCount: 4,
      manualCount: 1,
    });
  });

  it('lens=trainer sépare deux formateurs distincts', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, trainerId: 'tr1', trainerName: 'Marie Tut' },
      { ...base, attendanceSheetId: 'sh2', trainerId: 'tr2', trainerName: 'Jean Form' },
    ];
    const groups = groupByLens(rows, 'trainer');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(['tr1', 'tr2']);
  });

  it('lens=session retourne une ligne par feuille', () => {
    const rows: ConsolidatedSheetRow[] = [base, { ...base, attendanceSheetId: 'sh2' }];
    const groups = groupByLens(rows, 'session');
    expect(groups).toHaveLength(2);
    expect(groups[0].sheetCount).toBe(1);
  });

  it('regroupe les company_id null sous une clé "sans entreprise"', () => {
    const rows: ConsolidatedSheetRow[] = [{ ...base, companyId: null, companyName: null }];
    const groups = groupByLens(rows, 'company');
    expect(groups[0].key).toBe('none');
    expect(groups[0].label).toBe('Sans entreprise');
  });

  it('hasSyncError vrai si une feuille du groupe a un sync en erreur', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, zoomLastSyncStatus: 'success' },
      { ...base, attendanceSheetId: 'sh2', zoomLastSyncStatus: 'error' },
    ];
    const groups = groupByLens(rows, 'company');
    expect(groups[0].hasSyncError).toBe(true);
  });
});

describe('summarize', () => {
  it('calcule taux de signatures et couverture Zoom', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, status: 'open', expectedCount: 4, signedCount: 2, zoomCount: 1 },
      { ...base, attendanceSheetId: 'sh2', status: 'finalized', expectedCount: 2, signedCount: 2, zoomCount: 2 },
    ];
    const now = new Date('2026-06-05T00:00:00.000Z');
    const s = summarize(rows, now);
    // signed 4 / expected 6
    expect(s.signatureRate).toBeCloseTo(4 / 6, 5);
    // zoom 3 / signed 4
    expect(s.zoomCoverage).toBeCloseTo(3 / 4, 5);
    // 1 feuille incomplète (open avec signed<expected) ; la finalisée ne compte pas
    expect(s.incompleteSheets).toBe(1);
  });

  it('heures à risque : récupérable si dans la fenêtre de rétention, perdu sinon', () => {
    const now = new Date('2026-06-30T00:00:00.000Z');
    const rows: ConsolidatedSheetRow[] = [
      // terminée il y a 5 jours, incomplète, non finalisée => récupérable
      { ...base, attendanceSheetId: 'r', status: 'open', sessionHours: 3, expectedCount: 2, signedCount: 0,
        sessionEndsAt: '2026-06-25T12:00:00.000Z' },
      // terminée il y a 40 jours (> rétention), incomplète => perdue
      { ...base, attendanceSheetId: 'l', status: 'open', sessionHours: 4, expectedCount: 2, signedCount: 0,
        sessionEndsAt: '2026-05-21T12:00:00.000Z' },
      // finalisée => exclue du risque
      { ...base, attendanceSheetId: 'f', status: 'finalized', sessionHours: 5, expectedCount: 2, signedCount: 2,
        sessionEndsAt: '2026-06-25T12:00:00.000Z' },
    ];
    const s = summarize(rows, now);
    expect(ZOOM_RETENTION_DAYS).toBe(25);
    expect(s.hoursAtRiskRecoverable).toBe(3);
    expect(s.hoursAtRiskLost).toBe(4);
  });
});
