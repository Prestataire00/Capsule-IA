import type { Brand } from '@/shared/lib/branded';
import { makeId } from '@/shared/lib/branded';

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
export type DossierId = Brand<string, 'DossierId'>;
export type LearnerId = Brand<string, 'LearnerId'>;
export type CompanyId = Brand<string, 'CompanyId'>;
export type FormationId = Brand<string, 'FormationId'>;
export type ModuleId = Brand<string, 'ModuleId'>;
export type TrainerId = Brand<string, 'TrainerId'>;
export type FunderId = Brand<string, 'FunderId'>;
export type DossierModuleId = Brand<string, 'DossierModuleId'>;
export type DossierFunderId = Brand<string, 'DossierFunderId'>;

export const OrganizationId = makeId<'OrganizationId'>();
export const UserId = makeId<'UserId'>();
export const DossierId = makeId<'DossierId'>();
export const LearnerId = makeId<'LearnerId'>();
export const CompanyId = makeId<'CompanyId'>();
export const FormationId = makeId<'FormationId'>();
export const ModuleId = makeId<'ModuleId'>();
export const TrainerId = makeId<'TrainerId'>();
export const FunderId = makeId<'FunderId'>();
export const DossierModuleId = makeId<'DossierModuleId'>();
export const DossierFunderId = makeId<'DossierFunderId'>();
