// apps/web/features/identity/trainer-self/application/queries/get-my-profile.ts
import type { TrainerSelfRepository } from '../ports';
import { MembershipNotFound } from '../../domain/errors';
import type { TrainerId } from '@/features/dossier/domain/ids';
import type { TrainerProfile } from '../../domain/trainer-profile';

export class GetMyProfileQuery {
  constructor(private repo: TrainerSelfRepository) {}
  async execute(trainerId: TrainerId): Promise<TrainerProfile> {
    const p = await this.repo.findById(trainerId);
    if (!p) throw new MembershipNotFound(trainerId);
    return p;
  }
}
