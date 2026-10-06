// Règles des conversations directes, sans accès aux données.

export type Interlocuteur = {
  readonly userId: string;
  readonly nom: string;
  readonly fonction: string;
  readonly role: 'formateur' | 'equipe';
  readonly email: string | null;
};

/** « Léa Zola », « Léa Zola et Marc Petit », « Léa Zola, Marc Petit et 2 autres ». */
export function titreConversation(autres: readonly { nom: string }[]): string {
  const noms = autres.map((a) => a.nom);
  if (noms.length === 0) return 'Vous seul';
  if (noms.length === 1) return noms[0]!;
  if (noms.length === 2) return `${noms[0]} et ${noms[1]}`;
  if (noms.length === 3) return `${noms[0]}, ${noms[1]} et ${noms[2]}`;
  return `${noms[0]}, ${noms[1]} et ${noms.length - 2} autres`;
}

/** Deux conversations réunissent-elles exactement les mêmes personnes ? */
export function memesPersonnes(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/**
 * Prévenir par e-mail seulement au premier message resté sans lecture : une
 * conversation animée ne doit pas remplir une boîte de réception.
 */
export function prevenirParEmail(dernierAvant: string | null, luJusquA: string | null): boolean {
  if (!dernierAvant) return true;
  return luJusquA !== null && luJusquA >= dernierAvant;
}

/** Les personnes choisies, sans l'auteur ni doublon, toutes parmi celles qu'il peut joindre. */
export function participantsValides(
  auteurId: string,
  choisis: readonly string[],
  joignables: readonly string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const autorises = new Set(joignables);
  const ids = [...new Set(choisis.filter((id) => id !== auteurId))];
  if (ids.length === 0) return { ok: false, error: 'Choisissez au moins une autre personne.' };
  if (ids.some((id) => !autorises.has(id))) return { ok: false, error: 'Une des personnes choisies ne fait pas partie de votre organisme.' };
  return { ok: true, ids };
}
