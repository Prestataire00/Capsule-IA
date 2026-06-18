import { describe, it, expect } from 'vitest';
import { buildLearnerSummary, normalizeOne, type LearnerDossier } from './summary';

const dossier = (over: Partial<LearnerDossier> = {}): LearnerDossier => ({
  id: 'd1',
  reference: 'DOS-1',
  status: 'active',
  modality: 'presentiel',
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  total_hours: 28,
  total_amount_cents: 150000,
  formationTitle: 'Excel',
  hours: { hours_planned: 28, hours_attended: 21, attendance_rate: 90, at_risk: true },
  ...over,
});

describe('normalizeOne', () => {
  it('retourne null pour null/undefined/[]', () => {
    expect(normalizeOne(null)).toBeNull();
    expect(normalizeOne(undefined)).toBeNull();
    expect(normalizeOne([])).toBeNull();
  });
  it("extrait le premier élément d'un tableau (embed PostgREST)", () => {
    expect(normalizeOne([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
  });
  it("retourne l'objet tel quel si ce n'est pas un tableau", () => {
    expect(normalizeOne({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('buildLearnerSummary', () => {
  it('renvoie des zéros pour aucun dossier', () => {
    expect(buildLearnerSummary([])).toEqual({
      formationsCount: 0,
      hoursAttended: 0,
      hoursPlanned: 0,
      avgAttendanceRate: 0,
      atRiskCount: 0,
    });
  });

  it('agrège heures, assiduité moyenne et dossiers à risque', () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 28, hours_attended: 21, attendance_rate: 90, at_risk: true } }),
      dossier({ id: 'b', hours: { hours_planned: 40, hours_attended: 40, attendance_rate: 100, at_risk: false } }),
    ]);
    expect(s.formationsCount).toBe(2);
    expect(s.hoursAttended).toBe(61);
    expect(s.hoursPlanned).toBe(68);
    expect(s.avgAttendanceRate).toBe(95);
    expect(s.atRiskCount).toBe(1);
  });

  it("ignore les dossiers sans suivi d'heures dans la moyenne d'assiduité", () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 10, hours_attended: 5, attendance_rate: 50, at_risk: false } }),
      dossier({ id: 'b', hours: null }),
    ]);
    expect(s.formationsCount).toBe(2);
    expect(s.hoursAttended).toBe(5);
    expect(s.avgAttendanceRate).toBe(50);
  });

  it("arrondit la moyenne d'assiduité à l'entier", () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 10, hours_attended: 3, attendance_rate: 33, at_risk: false } }),
      dossier({ id: 'b', hours: { hours_planned: 10, hours_attended: 7, attendance_rate: 66, at_risk: false } }),
    ]);
    expect(s.avgAttendanceRate).toBe(50);
  });
});
