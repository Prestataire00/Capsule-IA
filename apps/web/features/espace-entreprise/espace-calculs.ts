// Ce que l'espace entreprise calcule : les heures de chaque apprenant, le
// planning, et ce qui attend le référent. Module pur.

export type DemiJournee = 'morning' | 'afternoon' | 'full' | 'evening';

/** Poids d'une demi-journée dans la séance : la même règle que le suivi des heures de l'équipe. */
const POIDS: Record<DemiJournee, number> = { morning: 1, afternoon: 1, evening: 1, full: 2 };
const poids = (d: string): number => POIDS[d as DemiJournee] ?? 1;

/** Présent, en retard ou à distance : l'heure est suivie. */
export const STATUTS_PRESENTS = new Set(['present', 'late', 'remote']);

export type Feuille = { readonly sheetId: string; readonly sessionId: string; readonly demiJournee: string };

export type SeanceDuree = { readonly id: string; readonly dureeHeures: number; readonly passee: boolean };

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Heures d'un apprenant. Prévues : la durée des séances où il est attendu.
 * Réalisées : la part de chaque demi-journée émargée présente. Une séance
 * passée sans feuille n'est pas mesurable — on le compte à part plutôt que
 * d'afficher une absence qui n'en est pas une.
 */
export function heuresApprenant(input: {
  seances: readonly SeanceDuree[];
  feuilles: readonly Feuille[];
  statuts: Readonly<Record<string, string | null>>;
}): { prevues: number; realisees: number; presences: number; absences: number; seancesSansFeuille: number } {
  let prevues = 0;
  let realisees = 0;
  let presences = 0;
  let absences = 0;
  let seancesSansFeuille = 0;
  for (const s of input.seances) {
    prevues += Math.max(0, s.dureeHeures);
    const siennes = input.feuilles.filter((f) => f.sessionId === s.id);
    if (siennes.length === 0) {
      if (s.passee) seancesSansFeuille += 1;
      continue;
    }
    const total = siennes.reduce((t, f) => t + poids(f.demiJournee), 0);
    for (const f of siennes) {
      const statut = input.statuts[f.sheetId] ?? null;
      if (statut && STATUTS_PRESENTS.has(statut)) {
        realisees += (Math.max(0, s.dureeHeures) * poids(f.demiJournee)) / total;
        presences += 1;
      } else if (statut === 'absent' || statut === 'absent_justified' || (!statut && s.passee)) {
        absences += 1;
      }
    }
  }
  return { prevues: arrondi(prevues), realisees: arrondi(realisees), presences, absences, seancesSansFeuille };
}

export type SeancePlanning = { readonly id: string; readonly debut: string; readonly fin: string };

const MOIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' });

/** À venir (la plus proche d'abord) et passées (la plus récente d'abord), groupées par mois. */
export function planning<T extends SeancePlanning>(
  seances: readonly T[],
  maintenant: Date,
): { aVenir: Array<{ mois: string; seances: T[] }>; passees: Array<{ mois: string; seances: T[] }> } {
  const grouper = (liste: T[]) => {
    const out: Array<{ mois: string; seances: T[] }> = [];
    for (const s of liste) {
      const mois = MOIS.format(new Date(s.debut));
      const dernier = out[out.length - 1];
      if (dernier && dernier.mois === mois) dernier.seances.push(s);
      else out.push({ mois, seances: [s] });
    }
    return out;
  };
  const t = maintenant.getTime();
  const aVenir = seances.filter((s) => new Date(s.fin).getTime() >= t).sort((a, b) => a.debut.localeCompare(b.debut));
  const passees = seances.filter((s) => new Date(s.fin).getTime() < t).sort((a, b) => b.debut.localeCompare(a.debut));
  return { aVenir: grouper(aVenir), passees: grouper(passees) };
}

export type Action = {
  readonly cle: string;
  readonly nature: 'signer' | 'repondre' | 'regler' | 'transmettre';
  readonly titre: string;
  readonly detail: string;
  readonly lien: string | null;
  readonly libelleLien: string | null;
  /** Échéance ou retard : en tête de liste. */
  readonly urgent: boolean;
};

const ORDRE: Record<Action['nature'], number> = { signer: 0, regler: 1, repondre: 2, transmettre: 3 };

/** Les urgences d'abord, puis signer, régler, répondre, transmettre. */
export function trierActions(actions: readonly Action[]): Action[] {
  return [...actions].sort((a, b) => Number(b.urgent) - Number(a.urgent) || ORDRE[a.nature] - ORDRE[b.nature]);
}

const ADRESSE_FACTICE = /\.invalid$/i;
export const aUneAdresse = (email: string | null | undefined): boolean =>
  Boolean(email && email.includes('@') && !ADRESSE_FACTICE.test(email.trim()));

export type SeanceHeures = { readonly dureeHeures: number; readonly passee: boolean; readonly formation: string; readonly groupe: string | null };

export type BilanHeures = {
  readonly realisees: number;
  readonly prevues: number;
  readonly seancesFaites: number;
  readonly seances: number;
};

const bilan = (liste: readonly SeanceHeures[]): BilanHeures => ({
  realisees: arrondi(liste.filter((s) => s.passee).reduce((t, s) => t + Math.max(0, s.dureeHeures), 0)),
  prevues: arrondi(liste.reduce((t, s) => t + Math.max(0, s.dureeHeures), 0)),
  seancesFaites: liste.filter((s) => s.passee).length,
  seances: liste.length,
});

/**
 * Les heures de formation, séance par séance (demande d'Ismael, 2026-10-07) :
 * une séance terminée compte sa durée, une seule fois — pas une fois par
 * apprenant. Au total, puis par formation et groupe.
 */
export function heuresDesSeances(seances: readonly SeanceHeures[]): {
  total: BilanHeures;
  parFormation: Array<{ formation: string; groupe: string | null } & BilanHeures>;
} {
  const groupes = new Map<string, SeanceHeures[]>();
  for (const s of seances) {
    const cle = `${s.formation}\u0000${s.groupe ?? ''}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), s]);
  }
  const parFormation = [...groupes.values()]
    .map((liste) => ({ formation: liste[0]?.formation ?? '', groupe: liste[0]?.groupe ?? null, ...bilan(liste) }))
    .sort((a, b) => a.formation.localeCompare(b.formation, 'fr') || (a.groupe ?? '').localeCompare(b.groupe ?? '', 'fr'));
  return { total: bilan(seances), parFormation };
}
