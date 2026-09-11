/**
 * Indicateurs de résultats d'une formation, tels qu'affichés partout où la
 * formation apparaît : formulaire, programme imprimé, fiche publique.
 *
 * Module sans dépendance serveur : le type est lu par le formulaire (composant
 * client), le formateur par le programme.
 */
export type FormationIndicatorsView = {
  readonly learners: number;
  readonly satisfactionRate: number | null;
  readonly satisfactionResponses: number;
  /** Provenance des chiffres saisis à la main pour cette formation, s'il y en a. */
  readonly declaredSources: readonly string[];
};

const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Ligne de texte pour le programme imprimé. Vide s'il n'y a encore aucun
 * résultat : la ligne disparaît alors du document plutôt que d'afficher un zéro.
 */
export function indicatorsPlainText(v: FormationIndicatorsView | null): string {
  if (!v) return '';
  const parts: string[] = [];
  if (v.learners > 0) parts.push(`${pluriel(v.learners, 'apprenant')} ${v.learners > 1 ? 'formés' : 'formé'}`);
  if (v.satisfactionRate !== null && v.satisfactionResponses > 0) {
    parts.push(`satisfaction ${v.satisfactionRate} % (${pluriel(v.satisfactionResponses, 'réponse')})`);
  }
  return parts.join(' · ');
}
