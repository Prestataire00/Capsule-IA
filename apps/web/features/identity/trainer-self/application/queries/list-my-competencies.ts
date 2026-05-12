// apps/web/features/identity/trainer-self/application/queries/list-my-competencies.ts
import type { TrainerCompetencyRepository } from '../ports';
import type { TrainerId } from '@/features/dossier/domain/ids';
import type { TrainerCompetency } from '../../domain/trainer-competency';

export class ListMyCompetenciesQuery {
  constructor(private repo: TrainerCompetencyRepository) {}
  execute(trainerId: TrainerId): Promise<TrainerCompetency[]> {
    return this.repo.listByTrainer(trainerId);
  }
}
