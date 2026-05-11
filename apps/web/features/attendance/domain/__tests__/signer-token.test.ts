import { describe, it, expect } from 'vitest';
import { createSignerTokenPayload } from '../signer-token.vo';
import { AttendanceSheetId, TokenJti } from '../ids';

const baseParams = () => ({
  sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
  signerId: '00000000-0000-0000-0000-000000000002',
  signerKind: 'learner',
  jti: TokenJti('00000000-0000-0000-0000-000000000003'),
  issuedAt: new Date('2026-05-11T08:00:00Z'),
  expiresAt: new Date('2026-05-11T08:30:00Z'),
  now: new Date('2026-05-11T08:10:00Z'),
});

describe('createSignerTokenPayload', () => {
  it('builds a valid payload', () => {
    const r = createSignerTokenPayload(baseParams());
    expect(r.ok).toBe(true);
  });

  it('rejects invalid signerKind', () => {
    const r = createSignerTokenPayload({ ...baseParams(), signerKind: 'admin' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_kind');
  });

  it('rejects expiresAt ≤ issuedAt', () => {
    const r = createSignerTokenPayload({
      ...baseParams(),
      issuedAt: new Date('2026-05-11T08:00:00Z'),
      expiresAt: new Date('2026-05-11T07:00:00Z'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('expires_before_issued');
  });

  it('rejects already expired against now', () => {
    const r = createSignerTokenPayload({
      ...baseParams(),
      now: new Date('2026-05-11T09:00:00Z'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('expired');
  });
});
