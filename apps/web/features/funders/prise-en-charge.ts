// ARCHETYPE: shared
// Où en est le financement d'un dossier, et combien reste-t-il à payer.
//
// Module pur : la même règle doit valoir pour l'écran du dossier, un futur
// tableau de bord et la facturation — sans quoi deux endroits annonceraient
// deux restes à payer différents.

export const STATUTS_FINANCEMENT = [
  { valeur: 'pending', label: 'À déposer', aide: 'Le dossier n’est pas encore parti chez le financeur.' },
  { valeur: 'submitted', label: 'Déposé', aide: 'Envoyé au financeur, en attente de sa réponse.' },
  { valeur: 'approved', label: 'Accordé', aide: 'Prise en charge acceptée.' },
  { valeur: 'refused', label: 'Refusé', aide: 'Prise en charge refusée : le reste à payer revient au client.' },
  { valeur: 'paid', label: 'Payé', aide: 'Le financeur a versé les fonds.' },
  {
    valeur: 'cancelled',
    label: 'Annulé',
    aide: 'Demande abandonnée ou retirée. Si plus aucun financeur n’est en jeu, les envois automatiques du dossier s’arrêtent.',
  },
] as const;

export type StatutFinancement = (typeof STATUTS_FINANCEMENT)[number]['valeur'];

export const estStatutFinancement = (v: string): v is StatutFinancement =>
  STATUTS_FINANCEMENT.some((s) => s.valeur === v);

export const libelleStatut = (v: string): string =>
  STATUTS_FINANCEMENT.find((s) => s.valeur === v)?.label ?? v;

/** Couleur de la pastille : acquis en vert, attente en ambre, refus en rouge. */
export const tonStatut = (v: string): 'success' | 'warning' | 'danger' | 'neutral' =>
  v === 'approved' || v === 'paid'
    ? 'success'
    : v === 'refused' || v === 'cancelled'
      ? 'danger'
      : v === 'submitted'
        ? 'warning'
        : 'neutral';

/** Une décision est-elle prise ? Tant qu'elle ne l'est pas, rien n'est acquis. */
export const estDecide = (v: string): boolean => v === 'approved' || v === 'refused' || v === 'paid';

/** Plus rien à attendre de cette ligne : refus du financeur, ou demande retirée. */
export const estHorsJeu = (v: string): boolean => v === 'refused' || v === 'cancelled';

/**
 * Le financement de ce dossier est-il arrêté ?
 *
 * Demandé en réunion du 21/09/2026 : un statut qui stoppe les e-mails
 * automatiques quand l'affaire s'arrête.
 *
 * **Toutes** les lignes doivent être hors jeu, pas une seule. Un OPCO qui
 * refuse pendant que l'employeur paie n'arrête rien : la formation a lieu, et
 * couper les convocations sur ce seul refus laisserait les stagiaires sans
 * convocation ni lien d'émargement, sans que personne s'en aperçoive avant le
 * jour J.
 *
 * Un dossier sans aucune ligne de financement n'est pas arrêté : rien n'a été
 * décidé, il n'y a donc rien à interrompre.
 */
export function financementArrete(statuts: readonly string[]): boolean {
  return statuts.length > 0 && statuts.every(estHorsJeu);
}

export type LigneFinanceur = {
  readonly status: string;
  /** Montant demandé au financeur. */
  readonly amountCents: number;
  /** Montant réellement accordé. `null` tant qu'il n'a pas répondu. */
  readonly grantedCents: number | null;
};

export type EtatFinancement = {
  /** Pris en charge pour de bon : accords et versements. */
  readonly acquisCents: number;
  /** Demandé mais sans réponse : ni acquis, ni perdu. */
  readonly enAttenteCents: number;
  /** Refusé : ce montant retombe sur le client. */
  readonly refuseCents: number;
  /** Ce que le client doit, une fois les accords déduits. */
  readonly resteAPayerCents: number;
  /** Ce qu'il resterait si tout ce qui est en attente était accordé. */
  readonly resteSiToutAccordeCents: number;
  /** Aucun financeur rattaché : le client paie tout. */
  readonly sansFinanceur: boolean;
  /** Une réponse est encore attendue quelque part. */
  readonly enAttenteDeReponse: boolean;
};

/**
 * À l'accord, c'est le montant ACCORDÉ qui fait foi — souvent inférieur au
 * demandé. Le prendre pour le demandé sous-évalue le reste à charge, et la
 * facture part fausse. Quand le financeur a dit oui sans chiffrer, on retient
 * le demandé, faute de mieux.
 */
const acquisDeLaLigne = (l: LigneFinanceur): number =>
  l.status === 'approved' || l.status === 'paid' ? (l.grantedCents ?? l.amountCents) : 0;

export function etatFinancement(totalCents: number | null | undefined, lignes: readonly LigneFinanceur[]): EtatFinancement {
  const total = Math.max(0, Math.round(Number(totalCents ?? 0)) || 0);
  const somme = (f: (l: LigneFinanceur) => number) => lignes.reduce((n, l) => n + Math.max(0, f(l)), 0);

  const acquisCents = somme(acquisDeLaLigne);
  const enAttenteCents = somme((l) => (estDecide(l.status) ? 0 : l.amountCents));
  const refuseCents = somme((l) => (l.status === 'refused' ? l.amountCents : 0));

  return {
    acquisCents,
    enAttenteCents,
    refuseCents,
    // Jamais négatif : un financeur plus généreux que prévu ne crée pas une
    // dette de l'organisme envers son client.
    resteAPayerCents: Math.max(0, total - acquisCents),
    resteSiToutAccordeCents: Math.max(0, total - acquisCents - enAttenteCents),
    sansFinanceur: lignes.length === 0,
    enAttenteDeReponse: lignes.some((l) => !estDecide(l.status)),
  };
}

/** Phrase d'état, pour dire en un coup d'œil où en est le financement. */
export function resumeFinancement(e: EtatFinancement): string {
  if (e.sansFinanceur) return 'Aucun financeur — le client règle la totalité.';
  if (e.enAttenteDeReponse) return 'En attente de la réponse d’un financeur.';
  if (e.acquisCents === 0) return 'Aucune prise en charge : tout reste à la charge du client.';
  return e.resteAPayerCents === 0 ? 'Intégralement pris en charge.' : 'Pris en charge en partie.';
}
