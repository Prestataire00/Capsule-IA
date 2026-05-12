import { describe, it, expect } from 'vitest';
import { TrainerProfile } from './trainer-profile';
import { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

const baseProps = {
  id: TrainerId('00000000-0000-0000-0000-000000000001'),
  organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
  userId: UserId('00000000-0000-0000-0000-000000000099'),
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
  phone: null,
  bio: null,
  specialties: [] as string[],
  avatarPath: null,
  isInternal: true,
  siret: null,
  hourlyRateCents: null,
};

describe('TrainerProfile', () => {
  it('crée un profil avec des invariants OK', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(p.firstName).toBe('Alice');
    expect(p.specialties).toEqual([]);
  });

  it('applyPatch met à jour bio/phone/specialties', () => {
    const p = TrainerProfile.hydrate(baseProps);
    p.applyPatch({ bio: 'Hello', phone: '+33612345678', specialties: ['fr', 'qualiopi'] });
    expect(p.bio).toBe('Hello');
    expect(p.phone).toBe('+33612345678');
    expect(p.specialties).toEqual(['fr', 'qualiopi']);
  });

  it('rejette bio > 2000 chars', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(() => p.applyPatch({ bio: 'x'.repeat(2001) })).toThrow('bio too long');
  });

  it('rejette specialties > 12 items', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(() => p.applyPatch({ specialties: Array(13).fill('s') })).toThrow('too many specialties');
  });

  it('toPersistence retourne les champs persistables uniquement (sans email/is_internal)', () => {
    const p = TrainerProfile.hydrate(baseProps);
    p.applyPatch({ bio: 'Hi' });
    const dto = p.toPersistence();
    expect(dto).toHaveProperty('bio', 'Hi');
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('is_internal');
  });

  it('toPersistence préserve les autres clés metadata (pas d’écrasement)', () => {
    const p = TrainerProfile.hydrate({
      ...baseProps,
      metadata: { external_id: 'ext-42', custom_flag: true },
    });
    p.applyPatch({ avatarPath: 'foo/avatar.png' });
    const dto = p.toPersistence();
    expect(dto.metadata).toEqual({
      external_id: 'ext-42',
      custom_flag: true,
      avatar_path: 'foo/avatar.png',
    });
  });

  it('toPersistence retire avatar_path si avatarPath devient null', () => {
    const p = TrainerProfile.hydrate({
      ...baseProps,
      metadata: { external_id: 'ext-42', avatar_path: 'old.png' },
      avatarPath: 'old.png',
    });
    p.applyPatch({ avatarPath: null });
    const dto = p.toPersistence();
    expect(dto.metadata).toEqual({ external_id: 'ext-42' });
  });
});
