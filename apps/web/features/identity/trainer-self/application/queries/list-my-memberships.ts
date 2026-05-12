// apps/web/features/identity/trainer-self/application/queries/list-my-memberships.ts
import type { MembershipReader, TrainerMembership } from '../ports';

export class ListMyMembershipsQuery {
  constructor(private reader: MembershipReader) {}
  execute(): Promise<TrainerMembership[]> {
    return this.reader.list();
  }
}
