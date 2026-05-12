import type { TrainerCompetencyRepository, MembershipReader } from '../ports';
import { TrainerCompetency } from '../../domain/trainer-competency';
import { CompetencyNotFound, MembershipNotFound } from '../../domain/errors';
import { CompetencyId, type OrganizationId } from '@/features/dossier/domain/ids';
import { uuidv7 } from 'uuidv7';

export type DuplicateCompetencyInput = {
  sourceCompetencyId: CompetencyId;
  targetOrganizationIds: OrganizationId[];
};

export class DuplicateCompetencyToOrgs {
  constructor(
    private repo: TrainerCompetencyRepository,
    private memberships: MembershipReader,
  ) {}

  async execute(input: DuplicateCompetencyInput): Promise<CompetencyId[]> {
    const source = await this.repo.findById(input.sourceCompetencyId);
    if (!source) throw new CompetencyNotFound(input.sourceCompetencyId);

    const all = await this.memberships.list();
    const targets = all.filter(m => input.targetOrganizationIds.includes(m.organizationId));
    if (targets.length === 0) throw new MembershipNotFound('no target memberships');

    const clones = targets.map(m => TrainerCompetency.hydrate({
      id: CompetencyId(uuidv7()),
      trainerId: m.trainerId,
      kind: source.kind,
      title: source.title,
      issuer: source.issuer,
      obtainedAt: source.obtainedAt,
      expiresAt: source.expiresAt,
      documentPath: source.documentPath,
    }));

    await this.repo.insertMany(clones);
    return clones.map(c => c.id);
  }
}
