import type { TrainerCompetencyRepository, CompetencyStorage } from '../ports';
import { TrainerCompetency, type CompetencyKind } from '../../domain/trainer-competency';
import { UploadFailed } from '../../domain/errors';
import { CompetencyId, type TrainerId, type OrganizationId } from '@/features/dossier/domain/ids';
import { uuidv7 } from 'uuidv7';

export type AddCompetencyInput = {
  trainerId: TrainerId;
  organizationId: OrganizationId;
  kind: CompetencyKind;
  title: string;
  issuer?: string | null;
  obtainedAt?: Date | null;
  expiresAt?: Date | null;
  file?: { name: string; body: ArrayBuffer; contentType: string };
};

export class AddCompetency {
  constructor(
    private repo: TrainerCompetencyRepository,
    private storage: CompetencyStorage,
  ) {}

  async execute(input: AddCompetencyInput): Promise<CompetencyId> {
    const id = CompetencyId(uuidv7());
    let documentPath: string | null = null;

    if (input.file) {
      try {
        documentPath = await this.storage.upload(
          input.organizationId, input.trainerId, id,
          input.file.name, input.file.body, input.file.contentType,
        );
      } catch (e) {
        throw new UploadFailed(e instanceof Error ? e.message : String(e));
      }
    }

    const c = TrainerCompetency.create({
      id,
      trainerId: input.trainerId,
      kind: input.kind,
      title: input.title.trim(),
      issuer: input.issuer ?? null,
      obtainedAt: input.obtainedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      documentPath,
    });

    await this.repo.insertMany([c]);
    return id;
  }
}
