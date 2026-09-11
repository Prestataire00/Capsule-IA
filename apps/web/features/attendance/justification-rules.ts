/**
 * Règles des justificatifs d'absence, pures et testables.
 *
 * Le type du fichier se lit dans ses premiers octets : le type déclaré par le
 * navigateur (et l'extension) se falsifient trivialement.
 */

export const MAX_JUSTIFICATION_BYTES = 10 * 1024 * 1024;
export const MAX_JUSTIFICATIONS_PER_SHEET = 5;
export const JUSTIFICATION_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic,.pdf,.png,.jpg,.jpeg,.webp,.heic';

export type JustificationType = { readonly mime: string; readonly ext: string };

const commencePar = (b: Uint8Array, sig: number[], decalage = 0) => sig.every((v, i) => b[decalage + i] === v);
const ascii = (b: Uint8Array, debut: number, fin: number) => String.fromCharCode(...b.slice(debut, fin));

export function sniffJustification(b: Uint8Array): JustificationType | null {
  if (b.length < 12) return null;
  if (commencePar(b, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', ext: 'pdf' };
  if (commencePar(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (commencePar(b, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  // Photos d'iPhone : conteneur ISO « ftyp » de marque HEIC/HEIF.
  if (ascii(b, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(ascii(b, 8, 12))) return { mime: 'image/heic', ext: 'heic' };
  return null;
}

/** Nom affiché à l'équipe : sans chemin ni caractère de contrôle, extension réelle. */
export function cleanFileName(name: string | null | undefined, ext: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const propre = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\.[^.]*$/, '').trim().slice(0, 120);
  return `${propre || 'justificatif'}.${ext}`;
}

export const DECISION_LABELS: Record<string, string> = {
  en_attente: 'À examiner',
  acceptee: 'Accepté',
  refusee: 'Refusé',
};
