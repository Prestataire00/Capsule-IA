import { describe, it, expect } from 'vitest';
import { AttendanceSheet } from '../attendance-sheet.entity';
import { Signature } from '../signature.entity';
import { AttendanceSheetId, SignatureId, SessionId, TokenJti } from '../ids';
import { OrganizationId, DossierId, LearnerId, UserId } from '@/features/dossier/domain/ids';

let counter = 0;
const newEventId = () => `evt-${++counter}`;
const now = () => new Date('2026-05-11T09:00:00Z');

const seed = () =>
  AttendanceSheet.create({
    id: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
    organizationId: OrganizationId('00000000-0000-0000-0000-000000000aaa'),
    dossierId: DossierId('00000000-0000-0000-0000-000000000bbb'),
    sessionId: SessionId('00000000-0000-0000-0000-000000000ccc'),
    halfDay: 'morning',
    splitStrategy: 'auto',
    newEventId,
    now,
  });

const makeSig = (suffix: string) =>
  Signature.recordPresent({
    id: SignatureId(`00000000-0000-0000-0000-0000000000${suffix.padStart(2, '0')}`),
    signerKind: 'learner',
    learnerId: LearnerId(`00000000-0000-0000-0000-1111111111${suffix.padStart(2, '0')}`),
    trainerId: null,
    signedAt: new Date('2026-05-11T09:05:00Z'),
    signerIp: '203.0.113.1',
    signerUserAgent: 'UA',
    signerCountry: 'FR',
    signaturePngPath: `p/${suffix}.png`,
    signatureHash: 'h'.repeat(64),
    tokenJti: TokenJti(`00000000-0000-0000-0000-2222222222${suffix.padStart(2, '0')}`),
    evidenceSource: 'qr',
    evidencePayload: null,
  });

describe('AttendanceSheet', () => {
  it('starts open with no signatures', () => {
    const s = seed();
    expect(s.snapshot.status).toBe('open');
    expect(s.events.find((e) => e.kind === 'AttendanceSheetCreated')).toBeDefined();
  });

  it('moves to completed when all participants signed', () => {
    const s = seed();
    const sig = makeSig('01');
    expect(sig.ok).toBe(true);
    if (sig.ok) s.addOrReplaceSignature(sig.value, now(), newEventId);
    expect(s.snapshot.status).toBe('completed');
  });

  it('refuses finalize if signatures incomplete (rehydrate with placeholder)', () => {
    const s = seed();
    const sig = makeSig('02');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);

    const rehydrated = AttendanceSheet.rehydrate({
      ...s.snapshot,
      signatures: [
        sig.value,
        Signature.rehydrate({
          id: SignatureId('00000000-0000-0000-0000-000000000099'),
          signerKind: 'learner',
          learnerId: LearnerId('00000000-0000-0000-0000-3333333333aa'),
          trainerId: null,
          status: null,
          signedAt: null,
          signerIp: null,
          signerUserAgent: null,
          signerCountry: null,
          signaturePngPath: null,
          signatureHash: null,
          tokenJti: null,
          evidenceSource: 'manual',
          evidencePayload: null,
          notes: null,
        }),
      ],
    });
    const r = rehydrated.finalize({
      documentId: '00000000-0000-0000-0000-000000000ddd',
      documentHash: 'd'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000eee'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('missing_signatures');
  });

  it('finalizes when all complete', () => {
    const s = seed();
    const sig = makeSig('03');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);
    const r = s.finalize({
      documentId: '00000000-0000-0000-0000-000000000fff',
      documentHash: 'f'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000eee'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(true);
    expect(s.snapshot.status).toBe('finalized');
    expect(s.events.find((e) => e.kind === 'AttendanceSheetFinalized')).toBeDefined();
  });

  it('refuses double finalize', () => {
    const s = seed();
    const sig = makeSig('04');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);
    s.finalize({
      documentId: '00000000-0000-0000-0000-000000000111',
      documentHash: 'a'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000222'),
      now: now(),
      newEventId,
    });
    const r = s.finalize({
      documentId: '00000000-0000-0000-0000-000000000333',
      documentHash: 'b'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000444'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_finalized');
  });

  it('refuses addOrReplaceSignature if already finalized', () => {
    const s = seed();
    const sig1 = makeSig('05');
    if (!sig1.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig1.value, now(), newEventId);
    s.finalize({
      documentId: '00000000-0000-0000-0000-000000000111',
      documentHash: 'a'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000222'),
      now: now(),
      newEventId,
    });
    const sig2 = makeSig('06');
    if (!sig2.ok) throw new Error('seed');
    const r = s.addOrReplaceSignature(sig2.value, now(), newEventId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_finalized');
  });
});
