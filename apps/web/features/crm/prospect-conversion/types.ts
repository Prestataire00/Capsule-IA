export type ProspectForConversion = {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  rqth: boolean;
  formationId: string | null;
  preferredModality: string | null;
  preferredStartDate: string | null;
  companyName: string | null;
  funderKind: string;
  convertedDossierId: string | null;
};

export type LearnerCandidate = { id: string; email: string; lastName: string };
export type CompanyCandidate = { id: string; name: string; siret: string | null };

export type MatchResult = { action: 'reuse'; id: string } | { action: 'create' };

export type DuplicateSignal = {
  kind: 'learner' | 'company';
  reason: string;
  existingId: string;
  label: string;
};

export type ConversionReport = {
  learner: 'reused' | 'created';
  company: 'reused' | 'created' | 'none';
  signals: DuplicateSignal[];
  alreadyConverted?: boolean;
};
