import Papa from 'papaparse';

export type ZoomParticipantRow = {
  readonly name: string | null;
  readonly email: string | null;
  readonly joinTime: Date | null;
  readonly leaveTime: Date | null;
  readonly durationMinutes: number;
  readonly rawLine: string;
};

export type ZoomCsvParseError =
  | { code: 'invalid_csv' }
  | { code: 'no_header' }
  | { code: 'missing_columns'; missing: string[] };

const COL_ALIASES: Record<'email' | 'name' | 'joinTime' | 'leaveTime' | 'durationMinutes', readonly string[]> = {
  email: ['user email', 'email', 'e-mail', 'adresse e-mail'],
  name: ['name (original name)', 'name', 'full name', 'nom', 'name (display name)'],
  joinTime: ['join time', 'first join', 'start time', "heure d'entrée"],
  leaveTime: ['leave time', 'last leave', 'end time', 'heure de sortie'],
  durationMinutes: [
    'total duration (minutes)',
    'duration (minutes)',
    'duration',
    'attendance time',
    'durée totale',
  ],
};

const findColumn = (header: readonly string[], aliases: readonly string[]): string | null => {
  for (const a of aliases) {
    const hit = header.find((h) => h.trim().toLowerCase() === a);
    if (hit) return hit;
  }
  return null;
};

const parseLocalDate = (s: string | undefined): Date | null => {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseDurationMinutes = (raw: string | undefined): number => {
  if (!raw) return 0;
  const n = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

export const parseZoomCsv = (
  csvContent: string,
): { ok: true; rows: ZoomParticipantRow[] } | { ok: false; error: ZoomCsvParseError } => {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  const realErrors = result.errors.filter((e) => e.code !== 'TooManyFields' && e.code !== 'TooFewFields');
  if (realErrors.length > 0) return { ok: false, error: { code: 'invalid_csv' } };

  const fields = result.meta.fields ?? [];
  if (fields.length === 0) return { ok: false, error: { code: 'no_header' } };

  const cols = {
    email: findColumn(fields, COL_ALIASES.email),
    name: findColumn(fields, COL_ALIASES.name),
    joinTime: findColumn(fields, COL_ALIASES.joinTime),
    leaveTime: findColumn(fields, COL_ALIASES.leaveTime),
    durationMinutes: findColumn(fields, COL_ALIASES.durationMinutes),
  };

  const missing = (Object.entries(cols) as Array<[keyof typeof cols, string | null]>)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.includes('email') || missing.includes('durationMinutes')) {
    return { ok: false, error: { code: 'missing_columns', missing } };
  }

  const rows: ZoomParticipantRow[] = result.data.map((r, i) => ({
    email: cols.email ? r[cols.email]?.trim() ?? null : null,
    name: cols.name ? r[cols.name]?.trim() ?? null : null,
    joinTime: cols.joinTime ? parseLocalDate(r[cols.joinTime]) : null,
    leaveTime: cols.leaveTime ? parseLocalDate(r[cols.leaveTime]) : null,
    durationMinutes: cols.durationMinutes ? parseDurationMinutes(r[cols.durationMinutes]) : 0,
    rawLine: `row_${i}:${fields.map((f) => r[f] ?? '').join(',')}`,
  }));

  return { ok: true, rows };
};
