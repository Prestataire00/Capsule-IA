/**
 * Séances lues dans un planning importé. Module pur.
 *
 * Un organisme reçoit souvent le calendrier d'une formation sous forme de
 * document : un tableau de dates, un planning envoyé par le client, l'annexe
 * d'une convention. Les ressaisir une à une est long et se trompe.
 *
 * Le modèle lit le document ; ce module décide ce qu'on en garde. La règle
 * cardinale est celle posée par l'organisme : **on ne calcule rien, on prend ce
 * qui est écrit**. Une séance dont la date ou l'horaire manque n'est pas
 * complétée par une valeur plausible — elle est écartée, et on dit pourquoi.
 */

import type { ImportSession } from './convention-types';

export type SeanceLue = {
  readonly label: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly modality: string;
  readonly location: string;
};

export type SeanceRejetee = {
  readonly seance: SeanceLue;
  readonly motif: string;
};

export type PlanningLu = {
  /** Prêtes à créer, dédoublonnées et triées. */
  readonly retenues: ImportSession[];
  /** Écartées, avec la raison — à montrer, jamais à taire. */
  readonly rejetees: SeanceRejetee[];
};

const MODALITES = ['presentiel', 'distanciel', 'hybride'] as const;
export type Modalite = (typeof MODALITES)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

const dateValide = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Rejette le 31 février : `Date` normaliserait silencieusement au 3 mars.
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

const heureValide = (v: string): boolean => {
  if (!HEURE.test(v)) return false;
  const [h, mi] = v.split(':').map(Number) as [number, number];
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
};

/** La modalité lue, ou le repli demandé — jamais une invention silencieuse. */
export function modaliteOuDefaut(lue: string, defaut: Modalite): Modalite {
  const propre = lue.trim().toLowerCase();
  return (MODALITES as readonly string[]).includes(propre) ? (propre as Modalite) : defaut;
}

/** Deux séances au même jour et à la même heure sont la même séance. */
const cle = (s: SeanceLue): string => `${s.date}|${s.startTime}|${s.endTime}`;

/**
 * Trie le planning lu en séances créables et séances écartées.
 *
 * `modalitePardefaut` vient du dossier : c'est une information qu'on possède,
 * pas une hypothèse. Les dates hors de la période du dossier sont gardées mais
 * signalées — c'est souvent le document qui déborde, parfois le dossier qui est
 * mal borné, et trancher à la place de l'organisme serait présomptueux.
 */
export function trierPlanning(
  lues: readonly SeanceLue[],
  options: { modalitePardefaut: Modalite },
): PlanningLu {
  const retenues: ImportSession[] = [];
  const rejetees: SeanceRejetee[] = [];
  const vues = new Set<string>();

  for (const s of lues) {
    if (!dateValide(s.date)) {
      rejetees.push({ seance: s, motif: 'date illisible ou inexistante' });
      continue;
    }
    if (!heureValide(s.startTime) || !heureValide(s.endTime)) {
      rejetees.push({ seance: s, motif: 'horaire illisible' });
      continue;
    }
    if (s.endTime <= s.startTime) {
      rejetees.push({ seance: s, motif: 'la fin précède le début' });
      continue;
    }
    if (vues.has(cle(s))) {
      rejetees.push({ seance: s, motif: 'séance en double dans le document' });
      continue;
    }

    vues.add(cle(s));
    retenues.push({
      label: s.label.trim().slice(0, 200),
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      modality: modaliteOuDefaut(s.modality, options.modalitePardefaut),
      location: s.location.trim().slice(0, 200),
    });
  }

  retenues.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return { retenues, rejetees };
}

/** Heures totales du planning retenu, pour comparer à ce que porte le dossier. */
export function heuresDuPlanning(seances: readonly ImportSession[]): number {
  const minutes = seances.reduce((total, s) => {
    const [h1, m1] = s.startTime.split(':').map(Number) as [number, number];
    const [h2, m2] = s.endTime.split(':').map(Number) as [number, number];
    return total + (h2 * 60 + m2) - (h1 * 60 + m1);
  }, 0);
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Séances du planning qui tombent hors de la période du dossier.
 *
 * Signalées, jamais écartées : un planning qui déborde dit peut-être que les
 * dates du dossier sont à corriger.
 */
export function horsPeriode(
  seances: readonly ImportSession[],
  periode: { debut: string | null; fin: string | null },
): ImportSession[] {
  if (!periode.debut || !periode.fin) return [];
  return seances.filter((s) => s.date < periode.debut! || s.date > periode.fin!);
}
