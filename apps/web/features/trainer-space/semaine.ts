/**
 * Ce qu'on lit dans une case du planning des formateurs. Module pur.
 *
 * Deux sources se croisent, et elles ne disent pas la même chose : ce que le
 * formateur a DÉCLARÉ (une intention) et ce que l'agenda a POSÉ (un fait). La
 * vue n'a de valeur que si elle les distingue — en particulier quand elles se
 * contredisent : une séance confiée à quelqu'un qui s'était déclaré
 * indisponible est exactement le coup de téléphone qu'on veut éviter, et
 * personne ne le verra si on l'affiche comme une séance ordinaire.
 */

import { type Creneau, type Declaration, statutPourCreneaux } from './availability';

export const ETATS = ['conflit', 'seance', 'indisponible', 'disponible', 'non_renseigne'] as const;
export type EtatCreneau = (typeof ETATS)[number];

export const ETAT_LABELS: Record<EtatCreneau, string> = {
  conflit: 'Séance posée alors qu’il s’est déclaré indisponible',
  seance: 'En séance',
  indisponible: 'Indisponible',
  disponible: 'Disponible',
  non_renseigne: 'Non renseigné',
};

/**
 * État d'une demi-journée pour un formateur.
 *
 * L'ordre des tests porte la règle : le fait prime sur l'intention, sauf
 * lorsqu'ils se contredisent — là, on montre la contradiction.
 */
export function etatCreneau(
  declarations: readonly Declaration[],
  creneau: Creneau,
  nbSeances: number,
): EtatCreneau {
  const declare = statutPourCreneaux(declarations, [creneau]);
  if (nbSeances > 0) return declare === 'indisponible' ? 'conflit' : 'seance';
  if (declare === 'indisponible') return 'indisponible';
  // « partiel » suppose plusieurs créneaux : sur un seul, il ne peut pas sortir.
  if (declare === 'disponible' || declare === 'partiel') return 'disponible';
  return 'non_renseigne';
}

/** Un formateur est-il mobilisable sur ce créneau ? */
export function estMobilisable(etat: EtatCreneau): boolean {
  return etat === 'disponible';
}

export type ResumeSemaine = {
  /** Demi-journées où il anime au moins une séance. */
  readonly seances: number;
  /** Demi-journées déclarées libres et réellement libres. */
  readonly libres: number;
  /** Contradictions à traiter — le chiffre qui doit sauter aux yeux. */
  readonly conflits: number;
};

export function resumeSemaine(etats: readonly EtatCreneau[]): ResumeSemaine {
  return {
    seances: etats.filter((e) => e === 'seance' || e === 'conflit').length,
    libres: etats.filter(estMobilisable).length,
    conflits: etats.filter((e) => e === 'conflit').length,
  };
}

/**
 * Trie les formateurs pour l'écran : d'abord ceux qui demandent une action
 * (conflits), puis ceux qui travaillent, puis les autres. Un tri purement
 * alphabétique enterre le problème en bas de page.
 */
export function ordreAffichage<T extends { nom: string; resume: ResumeSemaine }>(lignes: readonly T[]): T[] {
  return [...lignes].sort((a, b) => {
    if (a.resume.conflits !== b.resume.conflits) return b.resume.conflits - a.resume.conflits;
    if (a.resume.seances !== b.resume.seances) return b.resume.seances - a.resume.seances;
    return a.nom.localeCompare(b.nom, 'fr');
  });
}
