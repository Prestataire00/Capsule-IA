import type { TrainerCompetencyRepository, CompetencyStorage } from '../ports';
import { CompetencyNotFound } from '../../domain/errors';
import type { CompetencyId } from '@/features/dossier/domain/ids';

export class RemoveCompetency {
  constructor(
    private repo: TrainerCompetencyRepository,
    private storage: CompetencyStorage,
  ) {}

  async execute(id: CompetencyId): Promise<void> {
    const c = await this.repo.findById(id);
    if (!c) throw new CompetencyNotFound(id);
    if (c.documentPath) {
      await this.storage.remove(c.documentPath);
    }
    await this.repo.remove(id);
  }
}
