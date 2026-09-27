// ARCHETYPE: shared
// Une même adresse e-mail pour plusieurs stagiaires. Module pur.
//
// Une entreprise inscrit souvent ses salariés sous la boîte du service RH, un
// couple partage une adresse, un parent inscrit son enfant. La base refusait
// une seconde personne sur la même adresse, et l'ajout au dossier contournait
// le refus en réutilisant la fiche existante : le second salarié devenait le
// premier, son nom saisi était perdu, et il signait sous le nom d'un autre.
//
// La règle : même adresse ET même nom = la même personne, qu'on rattache ;
// même adresse, autre nom = une autre personne, qu'on crée. Dans les deux cas,
// on le DIT — c'est l'alerte demandée par Ismael le 27/09/2026.

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, ' ');

export const normaliserEmail = (e: string | null | undefined): string => (e ?? '').trim().toLowerCase();

export type Personne = { prenom: string | null; nom: string | null };

/**
 * Deux fiches sur la même adresse désignent-elles la même personne ?
 *
 * Le nom de famille décide. Le prénom départage quand il est connu des deux
 * côtés : deux salariés de la même famille partagent parfois nom et boîte.
 * Un nom manquant d'un côté : on regroupe, plutôt que d'ouvrir un doublon
 * d'une fiche simplement incomplète.
 */
export function memePersonne(a: Personne, b: Personne): boolean {
  const na = norm(a.nom);
  const nb = norm(b.nom);
  if (!na || !nb || na === '—' || nb === '—') return true;
  if (na !== nb) return false;
  const pa = norm(a.prenom);
  const pb = norm(b.prenom);
  if (!pa || !pb || pa === '—' || pb === '—') return true;
  return pa === pb;
}

export type Porteur = { id: string; prenom: string | null; nom: string | null; dossiers: string[] };

const nomComplet = (p: Personne): string => [p.prenom, p.nom].filter((x) => x && x !== '—').join(' ') || 'une autre fiche';

/** La personne déjà enregistrée sur cette adresse qui correspond à la saisie, s'il y en a une. */
export const porteurCorrespondant = (saisie: Personne, porteurs: readonly Porteur[]): Porteur | null =>
  porteurs.find((p) => memePersonne(saisie, p)) ?? null;

/**
 * L'alerte, en une phrase. Elle dit qui utilise déjà l'adresse, et ce qui va
 * se passer : rattachement ou création.
 */
export function alerteAdresse(email: string, saisie: Personne, porteurs: readonly Porteur[]): string | null {
  if (porteurs.length === 0) return null;
  const qui = porteurs
    .map((p) => `${nomComplet(p)}${p.dossiers.length ? ` (${p.dossiers.join(', ')})` : ''}`)
    .join(', ');
  const meme = porteurCorrespondant(saisie, porteurs);
  if (meme) {
    return `${email} est déjà utilisée par ${qui}. Même nom : c’est la même personne, elle sera rattachée à ce dossier.`;
  }
  return `${email} est déjà utilisée par ${qui}. Nom différent : ${nomComplet(saisie)} sera créé(e) comme une autre personne, sur la même adresse — les e-mails de l’un et de l’autre arriveront dans la même boîte.`;
}
