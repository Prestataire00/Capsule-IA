import { describe, it, expect } from 'vitest';
import { aRelancer, cleRelance, estSatisfaction } from './relance-satisfaction';

const maintenant = new Date('2026-09-27T08:00:00Z');
const il = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();

describe('relance des questionnaires de satisfaction', () => {
  it('à J+3, sans réponse', () => {
    expect(aRelancer({ status: 'pending', created_at: il(3) }, maintenant)).toBe(true);
    expect(aRelancer({ status: 'in_progress', created_at: il(4) }, maintenant)).toBe(true);
  });

  it('pas avant J+3', () => {
    expect(aRelancer({ status: 'pending', created_at: il(2.9) }, maintenant)).toBe(false);
  });

  it('jamais celui qui a répondu', () => {
    expect(aRelancer({ status: 'completed', created_at: il(5) }, maintenant)).toBe(false);
    expect(aRelancer({ status: 'expired', created_at: il(5) }, maintenant)).toBe(false);
  });

  it('pas l’arriéré : une semaine après le délai, on ne relance plus', () => {
    expect(aRelancer({ status: 'pending', created_at: il(11) }, maintenant)).toBe(false);
  });

  it('suit le délai réglé par l’organisme', () => {
    expect(aRelancer({ status: 'pending', created_at: il(4) }, maintenant, 5)).toBe(false);
    expect(aRelancer({ status: 'pending', created_at: il(5) }, maintenant, 5)).toBe(true);
  });

  it('toutes les satisfactions, et elles seules', () => {
    expect(estSatisfaction({ kind: 'satisfaction_chaud' })).toBe(true);
    expect(estSatisfaction({ kind: 'satisfaction_froid' })).toBe(true);
    expect(estSatisfaction({ kind: 'satisfaction_formateur' })).toBe(true);
    expect(estSatisfaction({ kind: 'satisfaction_chaud', code: 'satisfaction_entreprise_default' })).toBe(true);
    expect(estSatisfaction({ kind: 'positionnement' })).toBe(false);
    expect(estSatisfaction({ kind: 'custom' })).toBe(false);
  });

  it('une seule relance automatique par questionnaire', () => {
    expect(cleRelance('a1')).toBe('relance_satisfaction_j3:a1');
  });
});
