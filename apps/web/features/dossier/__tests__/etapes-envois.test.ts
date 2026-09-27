import { describe, it, expect } from 'vitest';
import { etapeQuestionnaires } from '../etapes-envois';

describe('étape « Questionnaires envoyés »', () => {
  it('franchie dès qu’un questionnaire est parti, avec sa date et les réponses', () => {
    const e = etapeQuestionnaires(
      [
        { status: 'completed', created_at: '2026-09-20T10:00:00Z', kind: 'satisfaction_chaud' },
        { status: 'pending', created_at: '2026-09-18T10:00:00Z', kind: 'evaluation_acquis' },
      ],
      0,
    );
    expect(e).toEqual({ done: true, at: '2026-09-18T10:00:00Z', hint: '2 envoyés, 1 répondu.' });
  });

  it('le positionnement n’en fait pas partie : il a son étape', () => {
    expect(etapeQuestionnaires([{ status: 'completed', created_at: '2026-09-18T10:00:00Z', kind: 'positionnement' }], 0).done).toBe(false);
  });

  it('dit quand des questionnaires cochés vont partir', () => {
    expect(etapeQuestionnaires([], 2).hint).toMatch(/2 questionnaires cochés.*partiront/);
    expect(etapeQuestionnaires([], 0).hint).toMatch(/Aucun questionnaire envoyé/);
  });
});
