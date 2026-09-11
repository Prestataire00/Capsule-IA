import { z } from 'zod';

/**
 * Statut d'auto-évaluation de l'organisme sur un indicateur Qualiopi.
 * Schéma partagé entre l'écran et la Server Action (règle projet).
 */
export const ORG_STATUSES = ['a_traiter', 'en_cours', 'conforme', 'non_applicable'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  a_traiter: 'À traiter',
  en_cours: 'En cours',
  conforme: 'Conforme',
  non_applicable: 'Non applicable',
};

export const setIndicatorStatusSchema = z.object({
  indicatorId: z.string().uuid(),
  status: z.enum(ORG_STATUSES),
  note: z.string().trim().max(2000).optional().nullable(),
});
export type SetIndicatorStatusInput = z.input<typeof setIndicatorStatusSchema>;

/** Types de fichiers acceptés comme preuve (miroir du seau `qualiopi-proofs`). */
export const PROOF_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;

export const PROOF_MAX_BYTES = 20 * 1024 * 1024;

/** Nom de fichier sûr pour un chemin de stockage : lettres, chiffres, tirets. */
export function safeFileName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'preuve').slice(0, 120);
}
