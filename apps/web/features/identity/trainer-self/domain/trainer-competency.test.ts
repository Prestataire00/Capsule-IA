import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TrainerCompetency } from './trainer-competency';
import { CompetencyDateInvalid } from './errors';
import { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

const NOW = new Date('2026-05-11T10:00:00Z');

describe('TrainerCompetency', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterAll(() => { vi.useRealTimers(); });

  const base = {
    id: CompetencyId('00000000-0000-0000-0000-000000000001'),
    trainerId: TrainerId('00000000-0000-0000-0000-00000000000a'),
    kind: 'diploma' as const,
    title: 'Master MEEF',
    issuer: 'Université Paris-Saclay',
    obtainedAt: new Date('2020-06-15'),
    expiresAt: null as Date | null,
    documentPath: null as string | null,
  };

  it('crée une compétence valide sans expiration', () => {
    const c = TrainerCompetency.create(base);
    expect(c.status).toBe('no_expiry');
  });

  it("status = 'valid' si expiresAt > now + 90j", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2027-01-01')
    });
    expect(c.status).toBe('valid');
  });

  it("status = 'expiring_soon' si expiresAt dans <90j", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2026-06-15') // ~35 jours
    });
    expect(c.status).toBe('expiring_soon');
  });

  it("status = 'expired' si expiresAt < now", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2025-01-01')
    });
    expect(c.status).toBe('expired');
  });

  it('refuse expiresAt <= obtainedAt', () => {
    expect(() => TrainerCompetency.create({
      ...base,
      obtainedAt: new Date('2026-01-01'),
      expiresAt: new Date('2025-12-31'),
    })).toThrow(CompetencyDateInvalid);
  });
});
