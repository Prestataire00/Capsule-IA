// apps/web/features/identity/trainer-self/application/ports.ts
import type { TrainerProfile } from '../domain/trainer-profile';
import type { TrainerCompetency } from '../domain/trainer-competency';
import type { TrainerId, OrganizationId, CompetencyId } from '@/features/dossier/domain/ids';

export type TrainerMembership = {
  organizationId: OrganizationId;
  organizationName: string;
  trainerId: TrainerId;
  firstName: string;
  lastName: string;
  isInternal: boolean;
};

export interface MembershipReader {
  list(): Promise<TrainerMembership[]>;
  /** Idempotent — appelée au layout load. */
  linkOrphans(): Promise<number>;
}

export interface TrainerSelfRepository {
  findById(id: TrainerId): Promise<TrainerProfile | null>;
  saveMany(profiles: TrainerProfile[]): Promise<void>;
}

export interface TrainerCompetencyRepository {
  findById(id: CompetencyId): Promise<TrainerCompetency | null>;
  listByTrainer(trainerId: TrainerId): Promise<TrainerCompetency[]>;
  insertMany(competencies: TrainerCompetency[]): Promise<void>;
  remove(id: CompetencyId): Promise<void>;
}

export interface AvatarStorage {
  upload(userId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string>;
  publicUrl(path: string): string;
}

export interface CompetencyStorage {
  upload(organizationId: string, trainerId: string, competencyId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string>;
  remove(path: string): Promise<void>;
}
