// Le statut d'un dossier suit ses séances, sans attendre un clic. Module pur.
//
// Les envois de fin de formation (attestation, certificat, satisfaction)
// partent pour les dossiers « terminés » le lendemain de leur fin : un dossier
// resté « planifié » parce que personne n'a cliqué « Marquer terminé » ne
// recevait jamais rien (audit du 07/10/2026).

export type Statut = 'draft' | 'pending_validation' | 'scheduled' | 'active' | 'completed' | 'closed' | 'archived' | 'cancelled';

/**
 * Le statut que le dossier devrait avoir, ou `null` s'il n'a pas à bouger.
 * Un dossier planifié avance avec ses séances. Un brouillon ou un dossier en
 * validation n'avance que si quelqu'un a émargé présent : c'est la preuve que
 * la formation a bien eu lieu, et qu'il ne s'agit pas d'une affaire en suspens.
 */
export function statutAttendu(input: {
  statut: Statut;
  premierDebut: string | null;
  derniereFin: string | null;
  presences: number;
  maintenant: Date;
}): 'active' | 'completed' | null {
  const { statut, premierDebut, derniereFin, presences, maintenant } = input;
  if (!premierDebut || !derniereFin) return null;
  if (!['draft', 'pending_validation', 'scheduled', 'active'].includes(statut)) return null;
  const prouve = statut === 'scheduled' || statut === 'active' || presences > 0;
  if (!prouve) return null;
  const t = maintenant.getTime();
  if (new Date(derniereFin).getTime() <= t) return 'completed';
  if (new Date(premierDebut).getTime() <= t && statut !== 'active') return 'active';
  return null;
}

/** Les étapes autorisées par la base pour y arriver (0015). */
export function etapesVers(statut: Statut, cible: 'active' | 'completed'): Statut[] {
  const etapes: Statut[] = [];
  if (statut !== 'active') etapes.push('active');
  if (cible === 'completed') etapes.push('completed');
  return etapes;
}
