/**
 * Décision d'un financeur sur une prise en charge (0177). Module pur.
 *
 * Le point qui compte : **un financement refusé ne couvre rien**. Tant que le
 * statut n'existait pas vraiment, le plan de facturation comptait la part de
 * l'OPCO comme acquise dès qu'elle était saisie — le reste à charge de
 * l'entreprise était sous-évalué, et la facture partait fausse.
 */

export const STATUTS_FINANCEMENT = ['pending', 'submitted', 'approved', 'refused', 'paid'] as const;
export type StatutFinancement = (typeof STATUTS_FINANCEMENT)[number];

export const STATUT_LABELS: Record<StatutFinancement, string> = {
  pending: 'À déposer',
  submitted: 'Déposé, en attente',
  approved: 'Accord',
  refused: 'Refus',
  paid: 'Payé',
};

export const STATUT_AIDES: Record<StatutFinancement, string> = {
  pending: 'La demande n’est pas encore partie chez le financeur.',
  submitted: 'En attente de la réponse du financeur.',
  approved: 'Prise en charge acceptée. Le montant accordé fait foi pour la facturation.',
  refused: 'Prise en charge refusée : la totalité revient au reste à charge.',
  paid: 'Financement encaissé.',
};

export function estStatutFinancement(v: unknown): v is StatutFinancement {
  return typeof v === 'string' && (STATUTS_FINANCEMENT as readonly string[]).includes(v);
}

/** Une décision a été rendue : l'accord ou le refus se datent et se motivent. */
export function estDecide(statut: StatutFinancement): boolean {
  return statut === 'approved' || statut === 'refused' || statut === 'paid';
}

/**
 * Ce que le financeur couvre réellement, en centimes.
 *
 * - refusé : rien, quel que soit le montant demandé ;
 * - accordé ou payé : le montant accordé s'il est connu, sinon le demandé
 *   (un accord sans chiffre vaut accord du montant demandé) ;
 * - à déposer ou déposé : le demandé, car c'est l'hypothèse de travail — mais
 *   ce n'est pas un engagement, d'où `estAcquis`.
 */
export function montantCouvertCents(
  statut: StatutFinancement,
  demandeCents: number,
  accordeCents: number | null,
): number {
  const demande = Math.max(0, Math.round(demandeCents || 0));
  if (statut === 'refused') return 0;
  if (statut === 'approved' || statut === 'paid') {
    return accordeCents === null ? demande : Math.max(0, Math.round(accordeCents));
  }
  return demande;
}

/** Le montant est-il engagé par le financeur, ou seulement espéré ? */
export function estAcquis(statut: StatutFinancement): boolean {
  return statut === 'approved' || statut === 'paid';
}

/**
 * Écart entre ce qui a été demandé et ce qui est accordé. Positif = le
 * financeur en met moins que prévu, et la différence retombe sur le client :
 * c'est le chiffre à montrer, pas à laisser deviner.
 */
export function manqueCents(
  statut: StatutFinancement,
  demandeCents: number,
  accordeCents: number | null,
): number {
  if (!estDecide(statut)) return 0;
  return Math.max(0, Math.round(demandeCents || 0) - montantCouvertCents(statut, demandeCents, accordeCents));
}
