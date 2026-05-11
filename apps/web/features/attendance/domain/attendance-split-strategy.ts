export type AttendanceSplitStrategy = 'auto' | 'per_day' | 'manual';

export const SPLIT_STRATEGIES: readonly AttendanceSplitStrategy[] = [
  'auto',
  'per_day',
  'manual',
];

export const isSplitStrategy = (v: unknown): v is AttendanceSplitStrategy =>
  typeof v === 'string' && (SPLIT_STRATEGIES as readonly string[]).includes(v);
