// Transitions de statut « pragmatiques » exposées à l'UI (changement en 1 clic).
// Volontairement plus souples que la machine à états stricte du domaine : elles
// reflètent l'usage réel (ex. démarrer un dossier directement), la conformité
// étant garantie côté base par le gate Qualiopi (trigger) + la RLS.
// Pur : aucun import server/react — utilisable côté client comme serveur.
import type { DossierStatus } from './domain/value-objects/dossier-status';

// Tout statut est atteignable depuis tout autre (0232, réunion avec Laurie,
// 16/10/2026) : un dossier saisi après coup passe directement en Terminé, un
// dossier qui attend son accord de prise en charge revient en Planifié.
const TOUS: DossierStatus[] = ['draft', 'pending_validation', 'scheduled', 'active', 'completed', 'closed', 'archived', 'cancelled'];
const sauf = (s: DossierStatus) => TOUS.filter((x) => x !== s);
export const STATUS_REACHABLE: Record<DossierStatus, DossierStatus[]> = {
  draft: sauf('draft'),
  pending_validation: sauf('pending_validation'),
  scheduled: sauf('scheduled'),
  active: sauf('active'),
  completed: sauf('completed'),
  closed: sauf('closed'),
  archived: sauf('archived'),
  cancelled: sauf('cancelled'),
};

// Libellé d'ACTION (le verbe) pour atteindre un statut donné.
export const STATUS_ACTION_LABEL: Record<DossierStatus, string> = {
  draft: 'Repasser en brouillon',
  pending_validation: 'Soumettre à validation',
  scheduled: 'Planifier',
  active: 'Démarrer la formation',
  completed: 'Marquer terminé',
  closed: 'Clôturer',
  archived: 'Archiver',
  cancelled: 'Annuler',
};

// Le libellé d'action « rouvrir » quand on repasse un dossier clos en actif.
export function actionLabel(from: DossierStatus, to: DossierStatus): string {
  if ((from === 'closed' || from === 'archived' || from === 'cancelled') && to === 'active') return 'Rouvrir le dossier';
  return STATUS_ACTION_LABEL[to];
}

// Étape suivante « logique » mise en avant comme bouton principal (ou null).
export function primaryNextStatus(from: DossierStatus): DossierStatus | null {
  switch (from) {
    case 'draft':
    case 'pending_validation':
    case 'scheduled':
      return 'active';
    case 'active':
    case 'completed':
      return 'closed';
    case 'closed':
      return 'archived';
    default:
      return null;
  }
}

export function canReachStatus(from: DossierStatus, to: DossierStatus): boolean {
  return STATUS_REACHABLE[from]?.includes(to) ?? false;
}
