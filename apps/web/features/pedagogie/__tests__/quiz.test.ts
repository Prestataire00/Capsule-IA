import { describe, it, expect } from 'vitest';
import {
  corrigerQuiz,
  problemesDuQuiz,
  baremeTotal,
  sansLesReponses,
  type QuestionQuiz,
} from '../quiz';

const q = (over: Partial<QuestionQuiz> = {}): QuestionQuiz => ({
  id: 'q1',
  enonce: 'Que signifie IA ?',
  choix: ['Intelligence artificielle', 'Information appliquée', 'Interface avancée'],
  bonnes: [0],
  points: 1,
  ...over,
});

describe('correction d’un quiz', () => {
  it('compte juste une réponse exacte', () => {
    const c = corrigerQuiz([q()], { q1: [0] });
    expect(c.note).toBe(1);
    expect(c.bareme).toBe(1);
    expect(c.pourcentage).toBe(100);
  });

  it('compte faux une réponse erronée', () => {
    const c = corrigerQuiz([q()], { q1: [1] });
    expect(c.note).toBe(0);
    expect(c.parQuestion[0]?.juste).toBe(false);
  });

  it('distingue « pas répondu » de « mal répondu »', () => {
    const c = corrigerQuiz([q()], {});
    expect(c.parQuestion[0]?.repondu).toBe(false);
    expect(c.note).toBe(0);
  });

  it('exige toutes les bonnes réponses d’une question à cocher', () => {
    const question = q({ bonnes: [0, 2], points: 2 });
    expect(corrigerQuiz([question], { q1: [0, 2] }).note).toBe(2);
    // Deux bonnes sur trois ne valent pas les deux tiers : la question est fausse.
    expect(corrigerQuiz([question], { q1: [0] }).note).toBe(0);
    // Une bonne et une mauvaise non plus.
    expect(corrigerQuiz([question], { q1: [0, 1] }).note).toBe(0);
  });

  it('ignore l’ordre et les doublons dans les cases cochées', () => {
    const question = q({ bonnes: [0, 2], points: 2 });
    expect(corrigerQuiz([question], { q1: [2, 0, 0] }).note).toBe(2);
  });

  it('pondère selon les points de chaque question', () => {
    const questions = [q({ id: 'a', points: 3 }), q({ id: 'b', points: 1 })];
    const c = corrigerQuiz(questions, { a: [0], b: [1] });
    expect(c.note).toBe(3);
    expect(c.bareme).toBe(4);
    expect(c.pourcentage).toBe(75);
  });

  it('ne déclare aucun échec quand il n’y a pas de seuil', () => {
    expect(corrigerQuiz([q()], { q1: [1] }).reussi).toBeNull();
  });

  it('tranche la réussite au seuil, inclus', () => {
    const questions = [q({ id: 'a' }), q({ id: 'b' })];
    expect(corrigerQuiz(questions, { a: [0] }, 50).reussi).toBe(true);
    expect(corrigerQuiz(questions, { a: [0] }, 51).reussi).toBe(false);
  });

  it('ne donne aucun point pour une question sans bonne réponse déclarée', () => {
    const c = corrigerQuiz([q({ bonnes: [] })], { q1: [0] });
    expect(c.note).toBe(0);
    expect(c.parQuestion[0]?.juste).toBe(false);
  });

  it('ne divise jamais par zéro sur un barème vide', () => {
    expect(corrigerQuiz([], {}).pourcentage).toBe(0);
    expect(baremeTotal([])).toBe(0);
  });
});

describe('ce qui empêche de publier un quiz', () => {
  it('accepte un quiz complet', () => {
    expect(problemesDuQuiz([q()])).toEqual([]);
  });

  it('refuse un quiz sans question', () => {
    expect(problemesDuQuiz([])).toHaveLength(1);
  });

  it('signale une question sans bonne réponse, avec son numéro', () => {
    const p = problemesDuQuiz([q(), q({ id: 'q2', bonnes: [] })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ question: 2 });
    expect(p[0]?.motif).toMatch(/bonne réponse/i);
  });

  it('refuse un énoncé vide, une seule proposition, ou zéro point', () => {
    expect(problemesDuQuiz([q({ enonce: '  ' })])[0]?.motif).toMatch(/énoncé/i);
    expect(problemesDuQuiz([q({ choix: ['Seule'], bonnes: [0] })])[0]?.motif).toMatch(/deux réponses/i);
    expect(problemesDuQuiz([q({ points: 0 })])[0]?.motif).toMatch(/points/i);
  });

  it('refuse une bonne réponse qui désigne une proposition vide', () => {
    const p = problemesDuQuiz([q({ choix: ['Vrai', '  ', 'Faux'], bonnes: [1] })]);
    expect(p.some((x) => /proposition vide/i.test(x.motif))).toBe(true);
  });
});

describe('ce que reçoit l’apprenant', () => {
  it('ne laisse pas filtrer les bonnes réponses', () => {
    const envoye = sansLesReponses([q({ bonnes: [0] })]);
    expect(envoye[0]).not.toHaveProperty('bonnes');
    expect(JSON.stringify(envoye)).not.toContain('bonnes');
  });
});
