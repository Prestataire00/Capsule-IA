import type { TrainerSelfRepository } from '../ports';
import type { TrainerProfilePatch } from '../../domain/trainer-profile';
import { MembershipNotFound } from '../../domain/errors';
import type { TrainerId } from '@/features/dossier/domain/ids';

export type UpdateTrainerProfileInput = {
  trainerIds: TrainerId[];
  patch: TrainerProfilePatch;
};

export class UpdateTrainerProfile {
  constructor(private repo: TrainerSelfRepository) {}

  async execute(input: UpdateTrainerProfileInput): Promise<void> {
    const profiles = await Promise.all(input.trainerIds.map(id => this.repo.findById(id)));
    const idx = profiles.findIndex(p => p === null);
    if (idx !== -1) throw new MembershipNotFound(input.trainerIds[idx]!);

    for (const p of profiles) p!.applyPatch(input.patch);
    await this.repo.saveMany(profiles as NonNullable<(typeof profiles)[number]>[]);
  }
}
