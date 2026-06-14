import { describe, it, expect } from 'vitest';
import { validateAnswers, type QuestionnaireSchema } from './schema';

const schema: QuestionnaireSchema = {
  questions: [
    { id: 'nps1', type: 'nps', label: 'NPS', required: true },
    { id: 'r1', type: 'rating', label: 'Qualité', required: true, max: 5 },
    { id: 'c1', type: 'choice', label: 'Reçu ?', required: true, options: ['Oui', 'Non'] },
    { id: 't1', type: 'text', label: 'Comment', required: false },
  ],
};

describe('validateAnswers', () => {
  it('accepte des réponses valides', () => {
    expect(validateAnswers(schema, { nps1: 9, r1: 4, c1: 'Oui', t1: '' }).ok).toBe(true);
  });
  it('rejette un requis manquant', () => {
    const r = validateAnswers(schema, { r1: 4, c1: 'Oui' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes('nps1'))).toBe(true);
  });
  it('rejette un NPS hors borne', () => {
    expect(validateAnswers(schema, { nps1: 12, r1: 4, c1: 'Oui' }).ok).toBe(false);
  });
  it('rejette un rating > max', () => {
    expect(validateAnswers(schema, { nps1: 5, r1: 9, c1: 'Oui' }).ok).toBe(false);
  });
  it('rejette un choix hors options', () => {
    expect(validateAnswers(schema, { nps1: 5, r1: 4, c1: 'Peut-être' }).ok).toBe(false);
  });
});
