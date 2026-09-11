// Tableau de bord de session : chaque étape se lit sur ce qui a réellement été
// produit, et une étape sans objet (aucun apprenant) ne passe jamais « fait ».
import { describe, it, expect } from 'vitest';
import { buildBoard, stepState, type BoardFacts } from '@/features/sessions/session-board';

const VIDE: BoardFacts = {
  formationId: null,
  hasPlace: false,
  trainerAssigned: false,
  learners: 0,
  conventions: 0,
  convocations: 0,
  sheets: 0,
  sheetsFinalized: 0,
  access: 0,
  positionnement: 0,
  evaluation: 0,
  satisfaction: 0,
  attestations: 0,
  invoiced: 0,
  qualiopiReady: 0,
};

const etape = (facts: BoardFacts, key: string) =>
  buildBoard(facts, '/sessions/s1')
    .flatMap((c) => c.steps)
    .find((s) => s.key === key)!;

describe('tableau de bord de session', () => {
  it('se découpe en quatre temps', () => {
    expect(buildBoard(VIDE, '/sessions/s1').map((c) => c.title)).toEqual([
      'Configuration',
      'Gestion',
      'Espace apprenant',
      'Suivi',
    ]);
  });

  it('dérive l’état du nombre réalisé', () => {
    expect(stepState(0, 3)).toBe('a_faire');
    expect(stepState(2, 3)).toBe('en_cours');
    expect(stepState(3, 3)).toBe('fait');
    expect(stepState(0, 0)).toBe('a_faire');
  });

  it('ne déclare rien de fait sans apprenant', () => {
    const toutes = buildBoard(VIDE, '/sessions/s1').flatMap((c) => c.steps);
    expect(toutes.every((s) => s.state === 'a_faire')).toBe(true);
  });

  it('compte par apprenant et plafonne au nombre d’inscrits', () => {
    const f = { ...VIDE, learners: 4, convocations: 4, access: 2, satisfaction: 6 };
    expect(etape(f, 'convocations').state).toBe('fait');
    expect(etape(f, 'acces')).toMatchObject({ done: 2, total: 4, state: 'en_cours' });
    expect(etape(f, 'satisfaction')).toMatchObject({ done: 4, total: 4 });
  });

  it('suit les émargements feuille par feuille', () => {
    expect(etape({ ...VIDE, sheets: 4, sheetsFinalized: 1 }, 'emargement')).toMatchObject({ done: 1, total: 4, state: 'en_cours' });
  });

  it('renvoie vers l’onglet où agir', () => {
    expect(etape(VIDE, 'acces').href).toBe('/sessions/s1/acces');
    expect(etape({ ...VIDE, formationId: 'f1' }, 'formation').href).toBe('/formations/f1');
    expect(etape(VIDE, 'formation').href).toBeUndefined();
  });
});
