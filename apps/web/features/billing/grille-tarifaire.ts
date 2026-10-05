/**
 * Grille tarifaire de l'organisme (0208). Module pur.
 *
 * Principe (grille d'Anissa, 05/10/2026) : un tarif par heure et par
 * stagiaire, dégressif avec l'effectif, et un plancher par heure de séance
 * qui protège la marge des petits groupes. Le tarif d'un stagiaire est donc le
 * plus haut des deux : le tarif de son palier, ou le plancher partagé entre
 * les présents. 2 stagiaires → 240 / 2 = 120 €/h chacun ; 6 → 40 € ; 11 → 35 €.
 *
 * La grille ne sert que par défaut : un prix saisi (sur la demande, la
 * formation, la séance ou le dossier) l'emporte toujours.
 */

export type Palier = {
  /** Effectif à partir duquel ce tarif s'applique. */
  readonly aPartirDe: number;
  readonly tarifHoraireCents: number;
};

export type GrilleTarifaire = {
  /** Tarif horaire par stagiaire du groupe standard. */
  readonly tarifStandardCents: number;
  /** Plancher facturé par heure de séance, quel que soit l'effectif. */
  readonly plancherHoraireCents: number;
  /** Tarifs dégressifs au-delà du standard (ex. 35 € à partir de 11). */
  readonly paliers: readonly Palier[];
  /** Coût horaire du formateur, pour afficher la marge. Jamais facturé. */
  readonly coutFormateurHoraireCents: number;
};

export const GRILLE_PAR_DEFAUT: GrilleTarifaire = {
  tarifStandardCents: 4000,
  plancherHoraireCents: 24000,
  paliers: [{ aPartirDe: 11, tarifHoraireCents: 3500 }],
  coutFormateurHoraireCents: 5000,
};

/** Tarif horaire du palier qui couvre cet effectif. */
export function tarifDuPalier(grille: GrilleTarifaire, stagiaires: number): number {
  const palier = [...grille.paliers]
    .filter((p) => p.aPartirDe <= stagiaires)
    .sort((a, b) => b.aPartirDe - a.aPartirDe)[0];
  return palier?.tarifHoraireCents ?? grille.tarifStandardCents;
}

export type PrixGrille = {
  /** Prix d'une heure pour un stagiaire. */
  readonly horaireParStagiaireCents: number;
  /** Ce que rapporte une heure de séance. */
  readonly horaireSessionCents: number;
  /** Total HT : par stagiaire × stagiaires × heures. */
  readonly totalCents: number;
  /** Le plancher l'a emporté sur le tarif du palier. */
  readonly plancherApplique: boolean;
};

export function prixSelonGrille(
  grille: GrilleTarifaire,
  args: { stagiaires: number; heures: number },
): PrixGrille {
  const n = Math.max(1, Math.round(args.stagiaires));
  const heures = Math.max(0, args.heures);
  const palier = tarifDuPalier(grille, n);
  const partDuPlancher = Math.ceil(grille.plancherHoraireCents / n);
  const horaire = Math.max(palier, partDuPlancher);
  return {
    horaireParStagiaireCents: horaire,
    horaireSessionCents: horaire * n,
    totalCents: Math.round(horaire * n * heures),
    plancherApplique: partDuPlancher > palier,
  };
}

/** Lignes du tableau de la grille, telles qu'Anissa les présente. */
export function tableauGrille(
  grille: GrilleTarifaire,
  effectifs: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 11, 15],
): Array<{ stagiaires: number; horaireParStagiaireCents: number; horaireSessionCents: number; margeHoraireCents: number }> {
  return effectifs.map((n) => {
    const p = prixSelonGrille(grille, { stagiaires: n, heures: 1 });
    return {
      stagiaires: n,
      horaireParStagiaireCents: p.horaireParStagiaireCents,
      horaireSessionCents: p.horaireSessionCents,
      margeHoraireCents: p.horaireSessionCents - grille.coutFormateurHoraireCents,
    };
  });
}

/** Une grille venue de la base n'est pas une grille tant qu'elle n'a pas été vérifiée. */
export function lireGrille(brut: unknown): GrilleTarifaire {
  if (!brut || typeof brut !== 'object') return GRILLE_PAR_DEFAUT;
  const o = brut as Record<string, unknown>;
  const cents = (v: unknown, defaut: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : defaut;
  const paliers = Array.isArray(o.paliers)
    ? o.paliers.flatMap((p): Palier[] => {
        if (!p || typeof p !== 'object') return [];
        const q = p as Record<string, unknown>;
        const n = typeof q.aPartirDe === 'number' ? Math.round(q.aPartirDe) : NaN;
        const t = cents(q.tarifHoraireCents, -1);
        return Number.isFinite(n) && n >= 1 && t >= 0 ? [{ aPartirDe: n, tarifHoraireCents: t }] : [];
      })
    : GRILLE_PAR_DEFAUT.paliers;
  return {
    tarifStandardCents: cents(o.tarifStandardCents, GRILLE_PAR_DEFAUT.tarifStandardCents),
    plancherHoraireCents: cents(o.plancherHoraireCents, GRILLE_PAR_DEFAUT.plancherHoraireCents),
    paliers,
    coutFormateurHoraireCents: cents(o.coutFormateurHoraireCents, GRILLE_PAR_DEFAUT.coutFormateurHoraireCents),
  };
}

export type SourcePrix = 'seance' | 'formation' | 'dossier' | 'grille';

export type PrixParDefaut = {
  readonly source: SourcePrix;
  /** Ligne de devis : quantité × prix unitaire. */
  readonly quantite: number;
  readonly unitaireCents: number;
  readonly totalCents: number;
  /** Pour la ligne de devis : comment le prix a été établi. */
  readonly explication: string;
};

const eurosFr = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100);

/**
 * Le prix d'une formation quand personne ne l'a négocié autrement. Un prix
 * saisi l'emporte toujours ; 0 vaut « pas de prix » (les colonnes de prix
 * sont obligatoires et 0 y sert de vide).
 *
 * 1. montant du dossier saisi à la main : un accord commercial, du cas par
 *    cas, qui passe avant tout tarif ;
 * 2. prix de la séance (par stagiaire) ;
 * 3. prix de la formation, par stagiaire ou global ;
 * 4. la grille : tarif horaire de l'effectif × heures × stagiaires.
 */
export function prixParDefaut(args: {
  grille: GrilleTarifaire;
  stagiaires: number;
  heures: number;
  seanceCents?: number | null;
  formationCents?: number | null;
  formationMode?: 'par_stagiaire' | 'forfait' | null;
  dossierTotalCents?: number | null;
}): PrixParDefaut {
  const n = Math.max(1, Math.round(args.stagiaires));
  if (args.dossierTotalCents != null && args.dossierTotalCents > 0) {
    return { source: 'dossier', quantite: 1, unitaireCents: args.dossierTotalCents, totalCents: args.dossierTotalCents, explication: 'montant convenu' };
  }
  if (args.seanceCents != null && args.seanceCents > 0) {
    return { source: 'seance', quantite: n, unitaireCents: args.seanceCents, totalCents: args.seanceCents * n, explication: 'tarif de la séance par stagiaire' };
  }
  if (args.formationCents != null && args.formationCents > 0) {
    return args.formationMode === 'forfait'
      ? { source: 'formation', quantite: 1, unitaireCents: args.formationCents, totalCents: args.formationCents, explication: 'prix global de la formation' }
      : { source: 'formation', quantite: n, unitaireCents: args.formationCents, totalCents: args.formationCents * n, explication: 'tarif par stagiaire' };
  }
  const p = prixSelonGrille(args.grille, { stagiaires: n, heures: args.heures });
  const unitaire = Math.round(p.horaireParStagiaireCents * Math.max(0, args.heures));
  return {
    source: 'grille',
    quantite: n,
    unitaireCents: unitaire,
    totalCents: unitaire * n,
    explication: `grille : ${eurosFr(p.horaireParStagiaireCents)} HT de l’heure par stagiaire pour ${n} stagiaire${n > 1 ? 's' : ''}`,
  };
}

/**
 * La ligne d'un devis qui couvre plusieurs dossiers (devis de groupe d'une
 * entreprise). Un dossier au montant convenu compte pour ce montant, ni plus
 * ni moins ; les autres sont chiffrés au tarif — séance, formation, ou grille
 * à l'effectif du groupe.
 */
export function ligneDeGroupe(args: {
  grille: GrilleTarifaire;
  heures: number;
  seanceCents?: number | null;
  formationCents?: number | null;
  formationMode?: 'par_stagiaire' | 'forfait' | null;
  /** Montant convenu de chaque dossier couvert ; null = pas d'accord particulier. */
  dossiers: ReadonlyArray<{ convenuCents: number | null }>;
}): PrixParDefaut {
  const n = Math.max(1, args.dossiers.length);
  const tarif = prixParDefaut({ ...args, stagiaires: n, dossierTotalCents: null });
  const convenus = args.dossiers.map((d) => d.convenuCents ?? 0).filter((c) => c > 0);
  if (convenus.length === 0) return tarif;

  const autres = n - convenus.length;
  // Un prix global de formation vaut pour tout le groupe : il ne se compte qu'une fois.
  const totalAutres = autres === 0 ? 0 : tarif.quantite === 1 ? tarif.totalCents : tarif.unitaireCents * autres;
  const total = convenus.reduce((a, c) => a + c, 0) + totalAutres;
  return {
    source: 'dossier',
    quantite: 1,
    unitaireCents: total,
    totalCents: total,
    explication: autres === 0 ? 'montant convenu' : `montant convenu pour ${convenus.length}, ${tarif.explication} pour ${autres}`,
  };
}
