import { describe, it, expect } from 'vitest';
import { buildParcours } from './parcours';

describe('buildParcours', () => {
  const base = {
    modules: [
      { id: 'm2', title: 'Module 2', position: 2 },
      { id: 'm1', title: 'Module 1', position: 1 },
    ],
    supports: [
      { moduleId: 'm1', resources: [{ id: 'r1', title: 'Support 1' }, { id: 'r2', title: 'Support 2' }] },
    ],
    exercises: [
      { id: 'e1', title: 'Exo 1', moduleId: 'm1', submission: { status: 'submitted' as const } },
      { id: 'e2', title: 'Exo 2', moduleId: 'm2', submission: null },
      { id: 'e3', title: 'Exo orphelin', moduleId: null, submission: { status: 'graded' as const } },
    ],
    questionnaires: [{ status: 'completed' }, { status: 'pending' }],
    sessions: [{ status: 'done' }, { status: 'planned' }],
    consultedResourceIds: new Set<string>(['r1']),
  };

  it('ordonne les modules par position et rattache ressources + exercices', () => {
    const p = buildParcours(base);
    expect(p.modules.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(p.modules[0]!.resources.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(p.modules[0]!.exercises.map((e) => e.id)).toEqual(['e1']);
  });

  it('calcule la progression du module (ressource consultée + exercice rendu)', () => {
    const p = buildParcours(base);
    const m1 = p.modules.find((m) => m.id === 'm1')!;
    // 3 items (r1, r2, e1) ; faits : r1 (consulté) + e1 (rendu) = 2 → 67%
    expect(m1.totalItems).toBe(3);
    expect(m1.doneItems).toBe(2);
    expect(m1.pct).toBe(67);
    expect(m1.completed).toBe(false);
  });

  it('module sans activité traçable → pct null', () => {
    const p = buildParcours({ ...base, supports: [], exercises: [] });
    expect(p.modules.every((m) => m.pct === null && m.totalItems === 0)).toBe(true);
  });

  it('sépare les exercices orphelins (sans module)', () => {
    const p = buildParcours(base);
    expect(p.orphanExercises.map((e) => e.id)).toEqual(['e3']);
    expect(p.orphanExercises[0]!.status).toBe('graded');
  });

  it('agrège la progression globale (modules + orphelins + questionnaires + sessions)', () => {
    const p = buildParcours(base);
    // done : r1 + e1 (m1) + e3 orphelin + 1 questionnaire + 1 session = 5
    // total : r1,r2,e1 (3) + e2 (1) + e3 (1) + 2 questionnaires + 2 sessions = 9
    expect(p.overall.done).toBe(5);
    expect(p.overall.total).toBe(9);
    expect(p.overall.pct).toBe(56);
  });

  it('parcours vide → global 0%', () => {
    const p = buildParcours({
      modules: [],
      supports: [],
      exercises: [],
      questionnaires: [],
      sessions: [],
      consultedResourceIds: new Set(),
    });
    expect(p.overall).toEqual({ done: 0, total: 0, pct: 0 });
  });
});
