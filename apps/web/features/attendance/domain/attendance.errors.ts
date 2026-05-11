export type AttendanceError =
  | { code: 'already_finalized' }
  | { code: 'missing_signatures'; signerIds: string[] }
  | { code: 'invalid_status_transition'; from: string; to: string }
  | { code: 'signer_not_a_participant'; signerId: string }
  | { code: 'token_replay' }
  | { code: 'token_invalid' }
  | { code: 'token_expired' };
