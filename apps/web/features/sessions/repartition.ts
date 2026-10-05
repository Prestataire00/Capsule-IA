/**
 * Répartir une séance en groupes le jour J. Module pur : les règles d'une
 * répartition, avant toute écriture.
 */

/** « Groupe A », « Groupe B »… */
export function nomsDeGroupes(n: number): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => `Groupe ${String.fromCharCode(65 + (i % 26))}`);
}

/** Partage équilibré, dans l'ordre de la liste (alphabétique en pratique). */
export function repartitionEquilibree<T>(stagiaires: readonly T[], groupes: number): T[][] {
  const n = Math.max(1, groupes);
  const parGroupe = Math.ceil(stagiaires.length / n);
  return Array.from({ length: n }, (_, i) => stagiaires.slice(i * parGroupe, (i + 1) * parGroupe));
}

export type GroupeSaisi = { readonly nom: string; readonly learnerIds: readonly string[] };

/**
 * Une répartition tient si : au moins deux groupes, des noms distincts, aucun
 * groupe vide, et chaque stagiaire de la séance dans un groupe et un seul.
 */
export function problemeDeRepartition(groupes: readonly GroupeSaisi[], stagiaires: readonly string[]): string | null {
  if (groupes.length < 2) return 'Il faut au moins deux groupes.';
  const noms = groupes.map((g) => g.nom.trim().toLowerCase());
  if (noms.some((n) => !n)) return 'Chaque groupe a un nom.';
  if (new Set(noms).size !== noms.length) return 'Deux groupes portent le même nom.';
  if (groupes.some((g) => g.learnerIds.length === 0)) return 'Un groupe est vide : retirez-le ou placez-y des stagiaires.';
  const places = groupes.flatMap((g) => g.learnerIds);
  if (new Set(places).size !== places.length) return 'Un stagiaire est dans deux groupes.';
  const attendus = new Set(stagiaires);
  if (places.some((id) => !attendus.has(id))) return 'Un stagiaire placé ne fait pas partie de la séance.';
  const oublies = stagiaires.filter((id) => !places.includes(id)).length;
  if (oublies > 0) return `${oublies} stagiaire${oublies > 1 ? 's ne sont' : ' n’est'} dans aucun groupe.`;
  return null;
}
