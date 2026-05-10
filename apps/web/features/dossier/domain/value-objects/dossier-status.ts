import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export const DossierStatusValues = [
  'draft',
  'pending_validation',
  'scheduled',
  'active',
  'completed',
  'closed',
  'archived',
  'cancelled',
] as const;

export type DossierStatus = (typeof DossierStatusValues)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<DossierStatus, readonly DossierStatus[]>> = {
  draft: ['pending_validation', 'cancelled'],
  pending_validation: ['scheduled', 'draft', 'cancelled'],
  scheduled: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: ['closed'],
  closed: ['archived', 'active'],
  archived: [],
  cancelled: [],
};

export type StatusTransitionContext = {
  readonly canReopen: boolean;
};

export const canTransition = (
  from: DossierStatus,
  to: DossierStatus,
  ctx: StatusTransitionContext = { canReopen: false },
): boolean => {
  if (from === to) return false;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) return false;
  if (from === 'closed' && to === 'active' && !ctx.canReopen) return false;
  return true;
};

export const guardTransition = (
  from: DossierStatus,
  to: DossierStatus,
  ctx?: StatusTransitionContext,
): Result<void, { code: 'invalid_transition'; from: DossierStatus; to: DossierStatus }> =>
  canTransition(from, to, ctx)
    ? ok(undefined)
    : err({ code: 'invalid_transition', from, to });

export const isTerminal = (s: DossierStatus): boolean =>
  s === 'archived' || s === 'cancelled';

export const isMutable = (s: DossierStatus): boolean =>
  s === 'draft' || s === 'pending_validation';
