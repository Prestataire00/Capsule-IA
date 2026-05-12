import { describe, it, expect, vi } from 'vitest';
import { UpdateTrainerProfile } from './update-trainer-profile';
import { TrainerProfile } from '../../domain/trainer-profile';
import { MembershipNotFound } from '../../domain/errors';
import type { TrainerSelfRepository } from '../ports';
import { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

const makeRepo = (profiles: TrainerProfile[]): TrainerSelfRepository => ({
  findById: vi.fn(async (id) => profiles.find(p => p.id === id) ?? null),
  saveMany: vi.fn(async () => {}),
});

const baseProps = {
  id: TrainerId('00000000-0000-0000-0000-00000000000a'),
  organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
  userId: UserId('00000000-0000-0000-0000-000000000099'),
  firstName: 'Alice', lastName: 'Martin', email: 'alice@example.com',
  phone: null, bio: null, specialties: [], avatarPath: null, isInternal: true,
};

describe('UpdateTrainerProfile', () => {
  it('met à jour 1 profil', async () => {
    const p = TrainerProfile.hydrate(baseProps);
    const repo = makeRepo([p]);
    const cmd = new UpdateTrainerProfile(repo);

    await cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-00000000000a')],
      patch: { bio: 'Hello' },
    });

    expect(repo.saveMany).toHaveBeenCalledTimes(1);
    const saved = (repo.saveMany as any).mock.calls[0][0];
    expect(saved[0].bio).toBe('Hello');
  });

  it('met à jour N profils en batch', async () => {
    const p1 = TrainerProfile.hydrate({ ...baseProps, id: TrainerId('00000000-0000-0000-0000-00000000000a') });
    const p2 = TrainerProfile.hydrate({ ...baseProps, id: TrainerId('00000000-0000-0000-0000-00000000000b') });
    const repo = makeRepo([p1, p2]);
    const cmd = new UpdateTrainerProfile(repo);

    await cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-00000000000a'), TrainerId('00000000-0000-0000-0000-00000000000b')],
      patch: { specialties: ['fr', 'qualiopi'] },
    });

    const saved = (repo.saveMany as any).mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved[0].specialties).toEqual(['fr', 'qualiopi']);
    expect(saved[1].specialties).toEqual(['fr', 'qualiopi']);
  });

  it('raise MembershipNotFound si un trainerId est inconnu', async () => {
    const repo = makeRepo([]);
    const cmd = new UpdateTrainerProfile(repo);
    await expect(cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-deadbeefdead')],
      patch: { bio: 'X' },
    })).rejects.toThrow(MembershipNotFound);
  });
});
