export type HalfDay = 'morning' | 'afternoon' | 'full' | 'evening';

export const HALF_DAYS: readonly HalfDay[] = ['morning', 'afternoon', 'full', 'evening'];

export const isHalfDay = (v: unknown): v is HalfDay =>
  typeof v === 'string' && (HALF_DAYS as readonly string[]).includes(v);

/**
 * Classifie une plage horaire (heures locales décimales 0-24) en HalfDay(s).
 * - traverse 12h00 → ['morning', 'afternoon']
 * - démarre ≥ 18h → ['evening']
 * - se termine ≤ 13h → ['morning']
 * - démarre ≥ 12h → ['afternoon']
 * - sinon → ['full']
 */
export const classifyHours = (
  startHourLocal: number,
  endHourLocal: number,
): HalfDay[] => {
  if (startHourLocal >= 18) return ['evening'];
  if (endHourLocal <= 13) return ['morning'];
  if (startHourLocal >= 12) return ['afternoon'];
  if (startHourLocal < 12 && endHourLocal > 12) return ['morning', 'afternoon'];
  return ['full'];
};
