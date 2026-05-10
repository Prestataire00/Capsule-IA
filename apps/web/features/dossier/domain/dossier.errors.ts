import type { DossierStatus } from './value-objects/dossier-status';

export type ClosingBlocker =
  | 'qualiopi_blocking_indicators'
  | 'documents_unsigned'
  | 'attendance_unsigned'
  | 'questionnaires_pending';

export type DossierError =
  | { code: 'invalid_inputs' }
  | { code: 'invalid_period' }
  | { code: 'invalid_modality' }
  | { code: 'invalid_transition'; from: DossierStatus; to: DossierStatus }
  | { code: 'dossier_immutable'; status: DossierStatus }
  | { code: 'duplicate_module' }
  | { code: 'unknown_module' }
  | { code: 'duplicate_funder' }
  | { code: 'unknown_funder' }
  | { code: 'duplicate_trainer' }
  | { code: 'unknown_trainer' }
  | { code: 'no_trainer_assigned' }
  | { code: 'no_modules' }
  | { code: 'funders_share_exceeds_100'; total: number }
  | { code: 'tenant_mismatch' }
  | { code: 'closing_blocked'; reasons: ClosingBlocker[] }
  | { code: 'reopen_forbidden' }
  | { code: 'cannot_cancel'; status: DossierStatus };
