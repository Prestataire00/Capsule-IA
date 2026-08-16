'use server';

import { guardAction } from '@/shared/lib/auth/guard-action';
import {
  extractProgrammeFromPdf,
  MAX_PDF_BYTES,
  type ExtractedProgramme,
} from './extract-from-pdf';

export type ImportProgrammeResult =
  | { ok: true; data: ExtractedProgramme }
  | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  unauthenticated: 'Session expirée, reconnectez-vous.',
  forbidden: "Vous n'avez pas les droits pour gérer le catalogue.",
  no_file: 'Aucun fichier reçu.',
  not_pdf: 'Le fichier doit être un PDF.',
  too_large: `Le PDF dépasse ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo.`,
  no_api_key: "La clé Anthropic n'est pas configurée sur ce serveur.",
  extraction_failed: "La lecture du PDF a échoué. Vérifiez qu'il n'est ni scanné en basse qualité ni protégé.",
};

/** Lit un programme PDF et renvoie les champs à pré-remplir — n'écrit rien en base. */
export async function importProgrammeFromPdf(formData: FormData): Promise<ImportProgrammeResult> {
  const guard = await guardAction('catalogue');
  if (!guard.ok) return { ok: false, error: ERRORS[guard.error] ?? guard.error };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: ERRORS.no_file! };
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: ERRORS.not_pdf! };
  }
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: ERRORS.too_large! };

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const result = await extractProgrammeFromPdf(base64);
  if (!result.ok) return { ok: false, error: ERRORS[result.reason] ?? ERRORS.extraction_failed! };

  return { ok: true, data: result.data };
}
