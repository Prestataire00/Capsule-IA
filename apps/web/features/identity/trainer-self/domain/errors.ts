export class MembershipNotFound extends Error {
  readonly tag = 'MembershipNotFound';
  constructor(public readonly trainerId: string) { super(`Membership not found: ${trainerId}`); }
}

export class ProfileFieldForbidden extends Error {
  readonly tag = 'ProfileFieldForbidden';
  constructor(public readonly field: string) { super(`Forbidden update on field: ${field}`); }
}

export class CompetencyDateInvalid extends Error {
  readonly tag = 'CompetencyDateInvalid';
  constructor() { super('expires_at must be after obtained_at'); }
}

export class CompetencyNotFound extends Error {
  readonly tag = 'CompetencyNotFound';
  constructor(public readonly id: string) { super(`Competency not found: ${id}`); }
}

export class UploadFailed extends Error {
  readonly tag = 'UploadFailed';
  constructor(public readonly reason: string) { super(`Upload failed: ${reason}`); }
}
