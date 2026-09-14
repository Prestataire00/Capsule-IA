// ARCHETYPE: shared
// Référent d'un dossier (0167) et titulaire provisoire.
//
// La base impose un titulaire à tout dossier (`dossiers.learner_id NOT NULL`).
// Une affaire intra signée avant la liste nominative n'en a pourtant aucun :
// l'import pose alors un titulaire provisoire sur une adresse en `.invalid`
// (RFC 2606), pour qu'aucun envoi ne parte vers un destinataire inventé.
// Partout où l'on montrerait « Stagiaires à désigner », on montre le référent.

/** Domaine réservé des titulaires provisoires créés à l'import. */
export const DOMAINE_PROVISOIRE = '@import.invalid';

export type Referent = {
  firstName: string | null;
  lastName: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
};

export const estTitulaireProvisoire = (email: string | null | undefined): boolean =>
  typeof email === 'string' && email.toLowerCase().endsWith(DOMAINE_PROVISOIRE);

const nomComplet = (p: { firstName?: string | null; lastName?: string | null } | null | undefined): string =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();

/**
 * Nom à afficher pour un dossier : l'apprenant quand il y en a un, le référent
 * du client tant que la liste nominative n'est pas arrivée.
 */
export function nomDuDossier(args: {
  learner: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined;
  referent?: Referent | null;
  companyName?: string | null;
}): { nom: string; estReferent: boolean } {
  const provisoire = estTitulaireProvisoire(args.learner?.email);
  const nomReferent = nomComplet(args.referent);

  if (provisoire && nomReferent) return { nom: nomReferent, estReferent: true };
  const nomApprenant = nomComplet(args.learner);
  if (!provisoire && nomApprenant) return { nom: nomApprenant, estReferent: false };
  if (nomReferent) return { nom: nomReferent, estReferent: true };
  return { nom: args.companyName?.trim() || '—', estReferent: false };
}
