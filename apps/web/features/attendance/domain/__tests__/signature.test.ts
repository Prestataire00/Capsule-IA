import { describe, it, expect } from 'vitest';
import { Signature } from '../signature.entity';
import { SignatureId, TokenJti } from '../ids';
import { LearnerId, TrainerId } from '@/features/dossier/domain/ids';

const validArgs = () => ({
  id: SignatureId('00000000-0000-0000-0000-000000000010'),
  signerKind: 'learner' as const,
  learnerId: LearnerId('00000000-0000-0000-0000-000000000020'),
  trainerId: null,
  signedAt: new Date('2026-05-11T09:05:00Z'),
  signerIp: '203.0.113.42',
  signerUserAgent: 'Mozilla/5.0',
  signerCountry: 'FR',
  signaturePngPath: 'sheet/learner/123.png',
  signatureHash: 'a'.repeat(64),
  tokenJti: TokenJti('00000000-0000-0000-0000-000000000030'),
  evidenceSource: 'qr' as const,
  evidencePayload: null,
});

describe('Signature.recordPresent', () => {
  it('builds a present signature', () => {
    const r = Signature.recordPresent(validArgs());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.props.status).toBe('present');
      expect(r.value.isComplete).toBe(true);
    }
  });

  it('rejects learner kind with trainerId set', () => {
    const r = Signature.recordPresent({
      ...validArgs(),
      trainerId: TrainerId('00000000-0000-0000-0000-000000000099'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('kind_id_mismatch');
  });

  it('requires hash when evidenceSource = qr', () => {
    const r = Signature.recordPresent({ ...validArgs(), signatureHash: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('present_missing_hash');
  });

  it('allows zoom_csv without PNG (only csv-line hash)', () => {
    const r = Signature.recordPresent({
      ...validArgs(),
      evidenceSource: 'zoom_csv',
      signatureHash: 'h'.repeat(64),
      signaturePngPath: null,
      tokenJti: null,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing IP', () => {
    const r = Signature.recordPresent({ ...validArgs(), signerIp: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('present_missing_ip');
  });
});

describe('Signature.override', () => {
  it('produces trainer_override source', () => {
    const r = Signature.recordPresent(validArgs());
    if (!r.ok) throw new Error('seed failed');
    const o = r.value.override('absent', 'Apprenant prévenu absence');
    expect(o.props.status).toBe('absent');
    expect(o.props.evidenceSource).toBe('trainer_override');
    expect(o.props.notes).toBe('Apprenant prévenu absence');
  });
});
