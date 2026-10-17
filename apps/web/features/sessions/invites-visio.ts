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

/**
 * Une adresse une seule fois, quelle que soit sa casse. Les vides et les
 * `.invalid` (titulaire provisoire, RFC 2606) n'invitent personne.
 */
export function invitesVisio(...listes: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string[] {
  const vus = new Set<string>();
  const invites: string[] = [];
  for (const email of listes.flat()) {
    const propre = email?.trim();
    if (!propre || !propre.includes('@') || propre.toLowerCase().endsWith('.invalid')) continue;
    const cle = propre.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    invites.push(propre);
  }
  return invites;
}

/** Le référent du dossier prime sur le contact générique de l'entreprise. */
export function referentDuDossier(input: {
  referentEmail?: string | null;
  companyEmail?: string | null;
}): string | null {
  return invitesVisio([input.referentEmail])[0] ?? invitesVisio([input.companyEmail])[0] ?? null;
}

export type Rappel = 'veille' | '2h';

const HEURE = 60 * 60 * 1000;

/**
 * Le rappel dû à cet instant, s'il y en a un. Le passage du cron est fréquent
 * mais pas exact : chaque rappel a une fenêtre, et l'envoi est rendu unique
 * par sa clé. Le rappel de la veille part dans les 24 h qui précèdent la
 * séance (réunion avec Laurie, 16/10/2026 : il partait à 48 h), jusqu'à 6 h
 * avant : plus tard, le rappel 2 h suffit.
 */
export function rappelDu(startsAt: string, maintenant: Date): Rappel | null {
  const reste = new Date(startsAt).getTime() - maintenant.getTime();
  if (reste <= 0) return null;
  if (reste <= 2 * HEURE) return '2h';
  if (reste > 6 * HEURE && reste <= 24 * HEURE) return 'veille';
  return null;
}
