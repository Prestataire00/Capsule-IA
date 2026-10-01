'use server';

import { guardAction } from '@/shared/lib/auth/guard-action';
import { extractProgrammeFromPdf, MAX_PDF_BYTES } from '@/features/formations/programme/extract-from-pdf';

export type LectureProgramme =
  | { ok: true; titre: string; heures: string }
  | { ok: false; error: string };

/**
 * Lit le programme joint à une demande pour en pré-remplir la formation
 * (intitulé, durée). Même lecture que l'import d'une fiche formation, mais
 * ouverte à qui gère les demandes : l'import, lui, exige le catalogue.
 * N'écrit rien en base.
 */
export async function lireProgramme(formData: FormData): Promise<LectureProgramme> {
  const guard = await guardAction('crm');
  if (!guard.ok) return { ok: false, error: guard.error === 'forbidden' ? 'Accès refusé.' : 'Session expirée, reconnectez-vous.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Aucun fichier reçu.' };
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Lecture automatique pour les PDF seulement : remplissez la formation à la main.' };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, error: `PDF de plus de ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo : il sera bien joint, mais remplissez la formation à la main.` };
  }

  const r = await extractProgrammeFromPdf(Buffer.from(await file.arrayBuffer()).toString('base64'));
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === 'no_api_key'
          ? 'Lecture automatique indisponible sur ce serveur : remplissez la formation à la main.'
          : 'Le programme n’a pas pu être lu : remplissez la formation à la main.',
    };
  }
  return { ok: true, titre: r.data.title, heures: r.data.durationHours };
}
