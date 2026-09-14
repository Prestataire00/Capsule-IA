/**
 * Quelles URL appartiennent à l'espace formateur.
 *
 * Deux espaces cohabitent sous le même domaine, et la page demandée avant
 * connexion (`redirectedFrom`) était rejouée telle quelle après. Un
 * administrateur dont l'onglet était resté sur l'espace formateur se voyait
 * donc renvoyé, à sa reconnexion, vers un espace qui n'est pas le sien — puis
 * refoulé avec un message qui semblait mettre son compte en cause.
 *
 * Module pur : la liste doit rester lisible et testable, elle vaut garde.
 */

/** Racines du groupe `app/(formateur)`. */
export const ROUTES_FORMATEUR = [
  '/formateur',
  '/mon-planning',
  '/mes-sessions',
  '/mes-evaluations',
  '/mes-factures',
  '/mes-frais',
  '/profil',
  '/profil-facturation',
  '/cv',
  '/emarger',
  '/seance',
] as const;

export function estRouteFormateur(chemin: string): boolean {
  const sansQuery = chemin.split(/[?#]/)[0] ?? '';
  return ROUTES_FORMATEUR.some((r) => sansQuery === r || sansQuery.startsWith(`${r}/`));
}

/**
 * La destination demandée est-elle atteignable par cette identité ?
 *
 * Une même personne peut être les deux : un formateur interne, membre de
 * l'organisme, garde accès aux deux espaces.
 */
export function destinationAutorisee(
  chemin: string,
  identite: { estMembre: boolean; estFormateur: boolean },
): boolean {
  return estRouteFormateur(chemin) ? identite.estFormateur : identite.estMembre;
}
