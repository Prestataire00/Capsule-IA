// Réussite ou échec d'un apprenant (0235). Pur.

export const RESULTATS = ['reussite', 'echec'] as const;
export type Resultat = (typeof RESULTATS)[number];

export const LIBELLE_RESULTAT: Record<Resultat, string> = { reussite: 'Réussite', echec: 'Échec' };

export const estResultat = (v: unknown): v is Resultat => v === 'reussite' || v === 'echec';

/** Le résultat d'un apprenant dans un dossier, s'il a été statué. */
export const resultatDe = (resultats: unknown, learnerId: string): Resultat | null => {
  const v = resultats && typeof resultats === 'object' ? (resultats as Record<string, unknown>)[learnerId] : null;
  return estResultat(v) ? v : null;
};
