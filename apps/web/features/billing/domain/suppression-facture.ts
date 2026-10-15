// Supprimer une facture (demande d'Ismael, 15/10/2026 : les factures de test,
// comme Stellantis). Un brouillon n'est pas une pièce comptable : il part sans
// cérémonie. Une facture émise, si : la retirer crée un trou dans la
// numérotation, ce qui n'est admis que pour une donnée de test. On exige donc
// de retaper son numéro, comme garde-fou contre le clic de trop.
// Couche domaine pure.

import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export type ErreurSuppression = 'confirmation_requise' | 'confirmation_incorrecte';

export type FactureASupprimer = { reference: string; status: string; provisoire: boolean };

export const confirmationExigee = (f: FactureASupprimer): boolean => !(f.status === 'draft' && f.provisoire);

export function peutSupprimerFacture(f: FactureASupprimer, confirmation: string | null): Result<true, ErreurSuppression> {
  if (!confirmationExigee(f)) return ok(true);
  const saisie = (confirmation ?? '').trim();
  if (!saisie) return err('confirmation_requise');
  return saisie.toUpperCase() === f.reference.trim().toUpperCase() ? ok(true) : err('confirmation_incorrecte');
}
