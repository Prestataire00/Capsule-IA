export type EvidenceSource =
  | 'manual'
  | 'qr'
  | 'zoom_csv'
  | 'zoom_api'
  | 'trainer_override';

export const EVIDENCE_SOURCES: readonly EvidenceSource[] = [
  'manual',
  'qr',
  'zoom_csv',
  'zoom_api',
  'trainer_override',
];

export const isEvidenceSource = (v: unknown): v is EvidenceSource =>
  typeof v === 'string' && (EVIDENCE_SOURCES as readonly string[]).includes(v);

/** Une signature manuscrite (manual ou qr) doit fournir un hash SHA-256 du PNG. */
export const requiresImageHash = (s: EvidenceSource): boolean =>
  s === 'manual' || s === 'qr';
