/**
 * État d'émargement d'un participant sur une demi-journée, et feuille prête à
 * être clôturée. Pur : même règle pour l'écran, la clôture et le PDF.
 *
 * Un apprenant est « complet » quand il a signé son entrée ET sa sortie (ou
 * qu'un départ anticipé est constaté), ou quand l'équipe / Zoom atteste sa
 * présence pour la demi-journée. Un absent, excusé ou non, est traité.
 * Le formateur signe une fois.
 */

export type AttendanceStatus = 'present' | 'absent' | 'absent_justified' | 'late' | 'remote';
export type ParticipantState = 'complet' | 'entree_seule' | 'a_signer' | 'absent' | 'excuse';

export type SignatureFacts = {
  readonly status: AttendanceStatus;
  readonly signedAt: string | null;
  readonly exitSignedAt: string | null;
  readonly captureMode: string | null;
  readonly evidenceSource: string | null;
  readonly earlyDeparture: string | null;
};

const MODES_SIGNES = new Set(['lien', 'lien_equipe', 'qr', 'tablette', 'visio']);
const SOURCES_ATTESTANT = new Set(['trainer_override', 'zoom_csv', 'zoom_api']);
const PRESENT = new Set<AttendanceStatus>(['present', 'late', 'remote']);

/** La personne a-t-elle signé elle-même ? (même règle que `app.attendance_self_signed`) */
export function isSelfSigned(f: Pick<SignatureFacts, 'captureMode' | 'evidenceSource' | 'signedAt'>): boolean {
  if (!f.signedAt) return false;
  if (f.captureMode) return MODES_SIGNES.has(f.captureMode);
  return f.evidenceSource === 'qr' || f.evidenceSource === 'manual';
}

/** Présence attestée sans signature : équipe (grille, visio) ou journal Zoom. */
export function isAttested(f: SignatureFacts): boolean {
  return !isSelfSigned(f) && f.signedAt !== null && PRESENT.has(f.status) && SOURCES_ATTESTANT.has(f.evidenceSource ?? '');
}

export function participantState(kind: 'learner' | 'trainer', f: SignatureFacts | null): ParticipantState {
  if (!f) return 'a_signer';
  if (f.status === 'absent') return 'absent';
  if (f.status === 'absent_justified') return 'excuse';
  const signe = isSelfSigned(f);
  if (kind === 'trainer') return signe || isAttested(f) ? 'complet' : 'a_signer';
  if (signe) return f.exitSignedAt || f.earlyDeparture ? 'complet' : 'entree_seule';
  return isAttested(f) ? 'complet' : 'a_signer';
}

/** Une feuille se clôture quand chaque participant attendu est traité. */
export function sheetReady(states: readonly ParticipantState[]): boolean {
  return states.length > 0 && states.every((s) => s === 'complet' || s === 'absent' || s === 'excuse');
}

export const STATE_LABELS: Record<ParticipantState, string> = {
  complet: 'Complet',
  entree_seule: 'Entrée signée',
  a_signer: 'À signer',
  absent: 'Absent',
  excuse: 'Absent excusé',
};

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Présent',
  late: 'En retard',
  absent: 'Absent',
  absent_justified: 'Absent excusé',
  remote: 'À distance',
};
