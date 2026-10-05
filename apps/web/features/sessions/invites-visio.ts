/**
 * Qui reçoit l'invitation à la visio d'une séance. Module pur.
 *
 * Les stagiaires et le formateur qui anime : sans le formateur, l'invitation
 * partait aux seuls stagiaires et il devait chercher le lien ailleurs.
 */

/** Formateurs de la séance, sinon ceux du dossier, sinon celui de la formation. */
export function formateursRetenus(sources: {
  seance: readonly string[];
  dossiers: readonly string[];
  formation: string | null;
}): string[] {
  if (sources.seance.length > 0) return [...new Set(sources.seance)];
  if (sources.dossiers.length > 0) return [...new Set(sources.dossiers)];
  return sources.formation ? [sources.formation] : [];
}

/** Une adresse une seule fois, quelle que soit sa casse ; les vides écartées. */
export function invitesVisio(...listes: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string[] {
  const vus = new Set<string>();
  const invites: string[] = [];
  for (const email of listes.flat()) {
    const propre = email?.trim();
    if (!propre || !propre.includes('@')) continue;
    const cle = propre.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    invites.push(propre);
  }
  return invites;
}
