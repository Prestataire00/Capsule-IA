// ARCHETYPE: shared
// Planifier une formation sur une période : « du 6 au 10 octobre, 9h–12h30 et
// 14h–17h30, du lundi au vendredi ».
//
// Module pur : la même règle doit valoir pour l'aperçu affiché avant création
// et pour les séances réellement écrites. Deux calculs séparés finiraient par
// annoncer un nombre de jours et en créer un autre.

export type Creneau = {
  /** Heure locale de début, « HH:MM ». */
  readonly debut: string;
  readonly fin: string;
  /** « matin », « après-midi » — sert à nommer la séance quand il y en a deux. */
  readonly libelle: string;
};

export type SeancePlanifiee = {
  /** Jour au format AAAA-MM-JJ. */
  readonly date: string;
  readonly debut: string;
  readonly fin: string;
  readonly libelle: string;
};

/** Lundi = 1 … dimanche = 7, comme la norme ISO — et comme on en parle. */
export const JOURS_SEMAINE = [
  { valeur: 1, court: 'L', long: 'lundi' },
  { valeur: 2, court: 'M', long: 'mardi' },
  { valeur: 3, court: 'M', long: 'mercredi' },
  { valeur: 4, court: 'J', long: 'jeudi' },
  { valeur: 5, court: 'V', long: 'vendredi' },
  { valeur: 6, court: 'S', long: 'samedi' },
  { valeur: 7, court: 'D', long: 'dimanche' },
] as const;

export const JOURS_OUVRES = [1, 2, 3, 4, 5];

/**
 * Garde-fou : au-delà, c'est une erreur de saisie (une date de fin tapée à
 * l'année suivante), pas une formation. Créer mille séances serait long à
 * défaire.
 */
export const MAX_SEANCES = 200;

export type ErreurPlanification =
  | 'dates_manquantes'
  | 'fin_avant_debut'
  | 'aucun_jour'
  | 'aucun_creneau'
  | 'creneau_invalide'
  | 'trop_de_seances';

const JOUR_MS = 86_400_000;
const estJour = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const estHeure = (v: string) => /^\d{2}:\d{2}$/.test(v);

/** Numéro ISO du jour de la semaine, calculé en UTC pour rester stable. */
export function jourDeLaSemaine(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const n = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return n === 0 ? 7 : n;
}

/** Jours retenus entre deux dates incluses, filtrés par jour de semaine. */
export function joursDeFormation(debut: string, fin: string, jours: readonly number[]): string[] {
  if (!estJour(debut) || !estJour(fin)) return [];
  const out: string[] = [];
  const t0 = Date.parse(`${debut}T00:00:00Z`);
  const t1 = Date.parse(`${fin}T00:00:00Z`);
  for (let t = t0; t <= t1; t += JOUR_MS) {
    const jour = new Date(t).toISOString().slice(0, 10);
    if (jours.includes(jourDeLaSemaine(jour))) out.push(jour);
  }
  return out;
}

/**
 * Séances à créer : un créneau par jour retenu.
 *
 * Les horaires sont dupliqués tels quels sur chaque jour — c'est bien le but.
 * La conversion en instants se fait ailleurs, au fuseau de Paris : ici on ne
 * manipule que des dates et des heures locales, ce qui rend la règle lisible
 * et vérifiable.
 */
export function genererSeances(entree: {
  dateDebut: string;
  dateFin: string;
  jours: readonly number[];
  creneaux: readonly Creneau[];
}): { ok: true; seances: SeancePlanifiee[] } | { ok: false; erreur: ErreurPlanification } {
  const { dateDebut, dateFin, jours, creneaux } = entree;

  if (!estJour(dateDebut) || !estJour(dateFin)) return { ok: false, erreur: 'dates_manquantes' };
  if (dateFin < dateDebut) return { ok: false, erreur: 'fin_avant_debut' };
  if (creneaux.length === 0) return { ok: false, erreur: 'aucun_creneau' };
  for (const c of creneaux) {
    if (!estHeure(c.debut) || !estHeure(c.fin) || c.fin <= c.debut) return { ok: false, erreur: 'creneau_invalide' };
  }

  const jourss = joursDeFormation(dateDebut, dateFin, jours);
  // Une période entière tombant hors des jours cochés : le dire, plutôt que de
  // ne rien créer en silence.
  if (jourss.length === 0) return { ok: false, erreur: 'aucun_jour' };

  const seances: SeancePlanifiee[] = [];
  for (const date of jourss) {
    for (const c of creneaux) seances.push({ date, debut: c.debut, fin: c.fin, libelle: c.libelle });
  }
  if (seances.length > MAX_SEANCES) return { ok: false, erreur: 'trop_de_seances' };

  return { ok: true, seances };
}

export const MESSAGES_PLANIFICATION: Record<ErreurPlanification, string> = {
  dates_manquantes: 'Indiquez la date de début et celle de fin.',
  fin_avant_debut: 'La date de fin précède celle de début.',
  aucun_jour: 'Aucun jour de la période ne correspond aux jours cochés.',
  aucun_creneau: 'Choisissez au moins le matin ou l’après-midi.',
  creneau_invalide: 'Horaires invalides : la fin précède le début.',
  trop_de_seances: `Cela ferait plus de ${MAX_SEANCES} séances — vérifiez les dates.`,
};

/** « 5 jours × 2 créneaux = 10 séances », dit avant de créer quoi que ce soit. */
export function resumePlanification(seances: readonly SeancePlanifiee[]): string {
  const jours = new Set(seances.map((s) => s.date)).size;
  const n = seances.length;
  if (n === 0) return 'Aucune séance.';
  return `${jours} jour${jours > 1 ? 's' : ''} · ${n} séance${n > 1 ? 's' : ''}`;
}
