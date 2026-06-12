// Module pur (pas de `server-only`) : décide si les pièces jointes d'un email
// financeur partent inline ou en lien, selon la taille totale. Resend plafonne
// ~40 MB par email ; on garde une marge.

export const RESEND_MAX_ATTACH_BYTES = 30 * 1024 * 1024;

export type AttachmentTransport = 'attach' | 'link';

export type ResolvedAttachment = {
  filename: string;
  storage_path: string;
  bytes: number;
  transport: AttachmentTransport;
};

/** Décide `attach` vs `link` selon la somme des tailles fournies. */
export function decideTransport(sizes: number[]): AttachmentTransport {
  const total = sizes.reduce((sum, n) => sum + n, 0);
  return total > RESEND_MAX_ATTACH_BYTES ? 'link' : 'attach';
}
