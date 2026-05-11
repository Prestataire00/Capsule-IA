import type { HalfDay } from './half-day';
import { classifyHours } from './half-day';
import type { AttendanceSplitStrategy } from './attendance-split-strategy';

export type MaterializedSheet = {
  readonly halfDay: HalfDay;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

const localHour = (d: Date, timeZone: string): number => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(d),
  );
  const minute = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, minute: '2-digit' }).format(d),
  );
  return hour + minute / 60;
};

const localDateKey = (d: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/**
 * Découpe une session en demi-journées selon la stratégie + TZ org.
 * - 'manual' → [] (le formateur déclare manuellement)
 * - 'per_day' → 1 sheet 'full' par jour calendaire local
 * - 'auto' → classify(start, end) avec split à 12h00 local (approx mid-session)
 */
export const materializeSheets = (args: {
  sessionStartsAt: Date;
  sessionEndsAt: Date;
  organizationTimezone: string;
  strategy: AttendanceSplitStrategy;
}): MaterializedSheet[] => {
  if (args.strategy === 'manual') return [];

  // Découpe par jour calendaire local (gère sessions multi-jours)
  const days: Array<{ start: Date; end: Date }> = [];
  let cursor = args.sessionStartsAt;
  while (cursor < args.sessionEndsAt) {
    const currentKey = localDateKey(cursor, args.organizationTimezone);
    let dayEnd = new Date(cursor);
    while (
      localDateKey(dayEnd, args.organizationTimezone) === currentKey &&
      dayEnd < args.sessionEndsAt
    ) {
      dayEnd = new Date(dayEnd.getTime() + 60_000);
    }
    const dayEndClamped = dayEnd > args.sessionEndsAt ? args.sessionEndsAt : dayEnd;
    days.push({ start: cursor, end: dayEndClamped });
    cursor = dayEndClamped;
  }

  if (args.strategy === 'per_day') {
    return days.map((d) => ({ halfDay: 'full' as HalfDay, startsAt: d.start, endsAt: d.end }));
  }

  // auto
  return days.flatMap((d) => {
    const startH = localHour(d.start, args.organizationTimezone);
    const endH = localHour(d.end, args.organizationTimezone);
    const halfDays = classifyHours(startH, endH);
    if (halfDays.length === 1) {
      return [{ halfDay: halfDays[0]!, startsAt: d.start, endsAt: d.end }];
    }
    const mid = new Date((d.start.getTime() + d.end.getTime()) / 2);
    return [
      { halfDay: 'morning' as HalfDay, startsAt: d.start, endsAt: mid },
      { halfDay: 'afternoon' as HalfDay, startsAt: mid, endsAt: d.end },
    ];
  });
};
