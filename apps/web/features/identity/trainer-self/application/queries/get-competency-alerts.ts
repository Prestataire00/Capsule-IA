// apps/web/features/identity/trainer-self/application/queries/get-competency-alerts.ts
import type { TrainerCompetencyRepository } from '../ports';
import type { TrainerId } from '@/features/dossier/domain/ids';

export class GetCompetencyAlertsQuery {
  constructor(private repo: TrainerCompetencyRepository) {}
  async execute(trainerId: TrainerId): Promise<{ expiringSoon: number; expired: number }> {
    const list = await this.repo.listByTrainer(trainerId);
    let expiringSoon = 0;
    let expired = 0;
    for (const c of list) {
      if (c.status === 'expiring_soon') expiringSoon++;
      else if (c.status === 'expired') expired++;
    }
    return { expiringSoon, expired };
  }
}
