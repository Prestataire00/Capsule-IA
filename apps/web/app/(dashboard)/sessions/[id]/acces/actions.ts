'use server';

import { z } from 'zod';
import { envoyerLienEntreprise } from '../../../dossiers/[id]/espace-entreprise/actions';

const schema = z.object({ sessionId: z.string().uuid(), dossierIds: z.array(z.string().uuid()).min(1).max(200) });

/**
 * Le lien de l'espace entreprise à chaque référent des dossiers de la séance.
 * Chaque envoi repasse par la garde du dossier.
 */
export async function envoyerLiensEntrepriseSeance(
  input: z.input<typeof schema>,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };
  let envoyes = 0;
  const echecs: string[] = [];
  for (const dossierId of [...new Set(p.data.dossierIds)]) {
    const r = await envoyerLienEntreprise(dossierId);
    if (r.ok) envoyes += 1;
    else echecs.push(r.error);
  }
  if (envoyes === 0) return { ok: false, error: echecs[0] ?? 'Aucun lien n’a pu partir.' };
  return {
    ok: true,
    message: `${envoyes} lien${envoyes > 1 ? 's' : ''} envoyé${envoyes > 1 ? 's' : ''}${echecs.length ? ` · ${echecs.length} sans référent ou sans adresse` : ''}.`,
  };
}
