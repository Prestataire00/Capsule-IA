import { z } from 'zod';

/** Schémas partagés entre les écrans d'émargement et leurs actions serveur. */

export const MARK_STATUSES = ['present', 'late', 'absent', 'absent_justified', 'remote'] as const;

const heure = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'heure_invalide')
  .nullish();

export const markSchema = z
  .object({
    sheetId: z.string().uuid(),
    learnerId: z.string().uuid(),
    status: z.enum(MARK_STATUSES),
    lateArrival: heure,
    earlyDeparture: heure,
    reason: z.string().trim().max(1000, 'texte_trop_long').nullish(),
    captureMode: z.enum(['grille', 'visio']).default('grille'),
  })
  .superRefine((v, ctx) => {
    const absent = v.status === 'absent' || v.status === 'absent_justified';
    if (absent && (v.lateArrival || v.earlyDeparture)) ctx.addIssue({ code: 'custom', message: 'incoherent_mark' });
    if (v.status === 'absent_justified' && !v.reason) ctx.addIssue({ code: 'custom', message: 'reason_required' });
  });
export type MarkInput = z.input<typeof markSchema>;

export const deviceSignatureSchema = z.object({
  sheetId: z.string().uuid(),
  signerId: z.string().uuid(),
  signerKind: z.enum(['learner', 'trainer']),
  moment: z.enum(['entry', 'exit']),
  dataUrl: z.string().startsWith('data:image/png;base64,', 'invalid_image_format').max(750_000, 'image_too_large'),
});
export type DeviceSignatureInput = z.input<typeof deviceSignatureSchema>;

/** Messages lisibles ; les codes les plus précis d'abord (recherche par inclusion). */
const ERREURS: ReadonlyArray<readonly [string, string]> = [
  ['already_signed_entry', 'L’entrée est déjà signée.'],
  ['already_signed_exit', 'La sortie est déjà signée.'],
  ['entry_required', 'Signez d’abord l’entrée.'],
  ['outside_signing_window', 'La signature n’est pas ouverte à cette heure pour cette demi-journée.'],
  ['signer_not_expected', 'Cette personne n’est pas attendue sur cette feuille.'],
  ['signature_required', 'La signature est obligatoire.'],
  ['attendance_sheet_finalized', 'La feuille est clôturée.'],
  ['attendance_sheet_not_found', 'Feuille introuvable.'],
  ['token_entry_used', 'L’entrée a déjà été signée avec ce lien.'],
  ['token_exit_used', 'La sortie a déjà été signée avec ce lien.'],
  ['token_consumed', 'Ce lien a déjà servi pour l’entrée et la sortie.'],
  ['token_revoked', 'Ce lien a été révoqué.'],
  ['token_expired', 'Ce lien a expiré.'],
  ['expired_token', 'Ce lien a expiré.'],
  ['token_payload_mismatch', 'Lien invalide.'],
  ['token_unknown', 'Lien invalide.'],
  ['invalid_token', 'Lien invalide.'],
  ['reason_required', 'Indiquez le motif de l’absence.'],
  ['incoherent_mark', 'Un absent n’a ni heure d’arrivée ni heure de départ.'],
  ['heure_invalide', 'Heure invalide (format HH:MM).'],
  ['sheet_incomplete', 'Chaque participant doit avoir signé ou être marqué absent avant la clôture.'],
  ['invalid_image_format', 'Signature illisible.'],
  ['image_too_large', 'Signature trop lourde.'],
  ['empty_image', 'La signature est vide.'],
  ['storage_upload_failed', 'La signature n’a pas pu être enregistrée.'],
  ['public_app_url_missing', 'L’adresse publique de l’application n’est pas configurée.'],
  ['unauthenticated', 'Session expirée — reconnectez-vous.'],
  ['forbidden', 'Accès refusé à cette feuille.'],
];

export function attendanceErrorCode(message: string | null | undefined): string {
  const m = message ?? '';
  return ERREURS.find(([code]) => m.includes(code))?.[0] ?? 'erreur_inconnue';
}

export function attendanceErrorLabel(codeOrMessage: string | null | undefined): string {
  const code = attendanceErrorCode(codeOrMessage);
  return ERREURS.find(([c]) => c === code)?.[1] ?? 'Une erreur est survenue. Réessayez.';
}
