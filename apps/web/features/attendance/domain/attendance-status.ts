export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

export const isAttendanceStatus = (v: unknown): v is AttendanceStatus =>
  typeof v === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(v);
