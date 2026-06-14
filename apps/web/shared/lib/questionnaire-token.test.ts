import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.TOKEN_SIGNING_KEY = process.env.TOKEN_SIGNING_KEY ?? 'dGVzdC1zaWduaW5nLWtleS1iYXNlNjQ=';
});

describe('questionnaire-token', () => {
  it('round-trip : un token signé se vérifie et restitue le payload', async () => {
    const { generateQuestionnaireToken, verifyQuestionnaireToken } = await import('./questionnaire-token');
    const signed = await generateQuestionnaireToken({
      assignmentId: '11111111-1111-1111-1111-111111111111',
      dossierId: '22222222-2222-2222-2222-222222222222',
      organizationId: '33333333-3333-3333-3333-333333333333',
    });
    const v = await verifyQuestionnaireToken(signed.token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.assignmentId).toBe('11111111-1111-1111-1111-111111111111');
  });
  it('rejette un token bidon', async () => {
    const { verifyQuestionnaireToken } = await import('./questionnaire-token');
    const v = await verifyQuestionnaireToken('not-a-jwt');
    expect(v.ok).toBe(false);
  });
});
