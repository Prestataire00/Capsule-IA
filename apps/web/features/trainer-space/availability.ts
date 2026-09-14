/**
 * Disponibilités d'un formateur (0166). Module pur : la même lecture doit
 * valoir dans son planning et dans l'écran où l'administration crée la séance.
 *
 * Le point délicat est l'absence de déclaration. Un jour non renseigné n'est
 * pas un jour libre : on l'affiche comme tel — « non renseigné » — plutôt que
 * de promettre une disponibilité que le formateur n'a jamais donnée.
 */

export const CRENEAUX = ['journee', 'matin', 'apres_midi'] as const;
export type Creneau = (typeof CRENEAUX)[number];

export const DISPOS = ['disponible', 'indisponible'] as const;
export type Dispo = (typeof DISPOS)[number];

export type Declaration = { creneau: Creneau; kind: Dispo };

/** Ce que voit l'administration pour un formateur, un jour donné. */
export type Statut = 'disponible' | 'indisponible' | 'partiel' | 'non_renseigne';

export const CRENEAU_LABELS: Record<Creneau, string> = {
  journee: 'Journée',
  matin: 'Matin',
  apres_midi: 'Après-midi',
};

export const STATUT_LABELS: Record<Statut, string> = {
  disponible: 'Disponible',
  indisponible: 'Indisponible',
  partiel: 'En partie',
  non_renseigne: 'Non renseigné',
};

/** Frontière matin / après-midi : 13 h, heure de Paris. */
export const MIDI = 13;

/**
 * Demi-journées qu'occupe une séance. Les heures sont fournies par l'appelant
 * (déjà ramenées au fuseau de l'organisme) : ce module ne connaît pas les
 * fuseaux, et n'a pas à les connaître.
 */
export function creneauxPourHeures(heureDebut: number, heureFin: number): Creneau[] {
  const couvre: Creneau[] = [];
  if (heureDebut < MIDI) couvre.push('matin');
  // Une séance qui finit à 13 h pile ne déborde pas sur l'après-midi.
  if (heureFin > MIDI) couvre.push('apres_midi');
  return couvre.length === 0 ? ['matin'] : couvre;
}

/** Une déclaration « journée » vaut pour les deux demi-journées. */
function pour(declarations: readonly Declaration[], creneau: Creneau): Dispo | null {
  const precise = declarations.find((d) => d.creneau === creneau);
  if (precise) return precise.kind;
  const journee = declarations.find((d) => d.creneau === 'journee');
  return journee ? journee.kind : null;
}

/**
 * Statut d'un formateur sur les créneaux dont la séance a besoin.
 *
 * Une seule indisponibilité suffit à rendre le formateur indisponible : sur une
 * séance qui court sur la journée, être pris le matin suffit à empêcher.
 */
export function statutPourCreneaux(
  declarations: readonly Declaration[],
  besoins: readonly Creneau[],
): Statut {
  const reponses = besoins.map((c) => pour(declarations, c));
  if (reponses.some((r) => r === 'indisponible')) return 'indisponible';
  if (reponses.every((r) => r === 'disponible')) return 'disponible';
  if (reponses.some((r) => r === 'disponible')) return 'partiel';
  return 'non_renseigne';
}

/** Statut affiché dans le planning du formateur, pour une journée entière. */
export function statutDuJour(declarations: readonly Declaration[]): Statut {
  return statutPourCreneaux(declarations, ['matin', 'apres_midi']);
}

/**
 * Déclarer une journée remplace les demi-journées, et inversement : sans cela,
 * « indisponible toute la journée » cohabiterait avec « disponible le matin ».
 */
export function creneauxRemplaces(creneau: Creneau): Creneau[] {
  return creneau === 'journee' ? ['journee', 'matin', 'apres_midi'] : ['journee', creneau];
}

export function isCreneau(v: unknown): v is Creneau {
  return typeof v === 'string' && (CRENEAUX as readonly string[]).includes(v);
}

export function isDispo(v: unknown): v is Dispo {
  return typeof v === 'string' && (DISPOS as readonly string[]).includes(v);
}
