/**
 * Heures-stagiaires d'une séance. Module pur.
 *
 * L'écran d'une séance annonçait « heures × stagiaires » en multipliant la
 * durée par le nombre d'INSCRITS. Une séance de 7 h où deux stagiaires sur cinq
 * ne sont jamais venus affichait donc 35 h — alors que le suivi du dossier, lui,
 * comptait les heures réellement suivies. Deux écrans, deux chiffres, et c'est
 * l'heure-stagiaire qui part au BPF et sert de base à la facturation.
 *
 * On ne remplace pas un chiffre par l'autre : les deux ont un sens. Le prévu dit
 * ce qui a été vendu, le réalisé ce qui a été fait. C'est l'écart qui informe,
 * et il n'était visible nulle part.
 */

export type DemiJournee = 'morning' | 'afternoon' | 'full' | 'evening';

export type FeuilleEmargement = {
  readonly demiJournee: DemiJournee;
  /** Présences constatées (signées ou attestées). */
  readonly presents: number;
};

/**
 * Poids d'une demi-journée dans la durée totale de la séance. Les heures ne
 * sont pas stockées feuille par feuille : on répartit la durée de la séance au
 * prorata, une journée entière pesant deux demi-journées.
 */
const POIDS: Record<DemiJournee, number> = {
  morning: 1,
  afternoon: 1,
  evening: 1,
  full: 2,
};

export type HeuresStagiaires = {
  /** Durée × inscrits : ce qui était prévu. */
  readonly prevues: number;
  /** Somme des présences × durée de leur demi-journée : ce qui a eu lieu. */
  readonly realisees: number;
  /**
   * `false` quand aucune feuille d'émargement n'existe encore : le réalisé vaut
   * alors zéro par ignorance, pas par absence. L'écran doit le dire plutôt que
   * d'afficher un écart imaginaire.
   */
  readonly mesurable: boolean;
};

const arrondi = (n: number): number => Math.round(n * 100) / 100;

export function heuresStagiaires(input: {
  dureeHeures: number;
  inscrits: number;
  feuilles: readonly FeuilleEmargement[];
}): HeuresStagiaires {
  const duree = Math.max(0, input.dureeHeures || 0);
  const inscrits = Math.max(0, Math.trunc(input.inscrits || 0));
  const prevues = arrondi(duree * inscrits);

  const poidsTotal = input.feuilles.reduce((t, f) => t + POIDS[f.demiJournee], 0);
  if (poidsTotal === 0) return { prevues, realisees: 0, mesurable: false };

  const realisees = input.feuilles.reduce((t, f) => {
    const heuresDeLaFeuille = (duree * POIDS[f.demiJournee]) / poidsTotal;
    return t + heuresDeLaFeuille * Math.max(0, Math.trunc(f.presents || 0));
  }, 0);

  return { prevues, realisees: arrondi(realisees), mesurable: true };
}

/**
 * Heures-stagiaires perdues faute de présence. Zéro quand rien n'est encore
 * mesurable, et jamais négatif : un stagiaire de plus que prévu ne crée pas un
 * écart négatif, il signale un problème d'inscription — pas une heure en trop.
 */
export function heuresManquantes(h: HeuresStagiaires): number {
  if (!h.mesurable) return 0;
  return arrondi(Math.max(0, h.prevues - h.realisees));
}

/** Part des heures-stagiaires réellement suivies, en pourcentage entier. */
export function tauxDeRealisation(h: HeuresStagiaires): number | null {
  if (!h.mesurable || h.prevues === 0) return null;
  return Math.round((h.realisees / h.prevues) * 100);
}
