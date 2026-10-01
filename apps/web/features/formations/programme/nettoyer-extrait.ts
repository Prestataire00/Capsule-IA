import 'server-only';
import { nettoyerHtmlDocument } from '@/shared/lib/html/sanitize-document-html';
import { CHAMPS_HTML, programmeExtraitSchema, type ProgrammeExtrait } from './programme-extrait';

/**
 * Valide et nettoie un programme extrait. Il vient d'un PDF fourni par un
 * tiers, lu par l'IA, puis repasse par le navigateur : son HTML n'est sûr
 * qu'une fois nettoyé ici, côté serveur. `null` si la forme est invalide.
 */
export function nettoyerExtrait(brut: unknown): ProgrammeExtrait | null {
  const p = programmeExtraitSchema.safeParse(brut);
  if (!p.success) return null;
  const propre = { ...p.data };
  for (const champ of CHAMPS_HTML) propre[champ] = nettoyerHtmlDocument(propre[champ]);
  return propre;
}
