/**
 * À qui va la convention d'un dossier. Pour une entreprise cliente, à son
 * référent seulement : c'est elle qui contracte et signe, ses salariés n'ont
 * pas à recevoir ses conditions ni ses tarifs (point Capsule IA du
 * 05/10/2026). Pour un particulier, c'est son propre contrat de formation :
 * il le reçoit et le signe. Pur.
 */
export const conventionAuReferent = (dossier: { companyId: string | null }): boolean => dossier.companyId !== null;

/** Les types de documents que l'on peut adresser au stagiaire d'un dossier d'entreprise. */
export const conventionVisiblePourLeStagiaire = (dossier: { companyId: string | null }): boolean => !conventionAuReferent(dossier);

/**
 * Ce qu'un stagiaire peut voir d'un document de son dossier : seulement ce
 * qui est marqué « Commun à tous », et jamais la convention d'une entreprise.
 * Même règle pour la liste, le téléchargement et la signature.
 */
export const documentVisiblePourLeStagiaire = (
  doc: { visibleEntreprise: boolean; kind: string },
  dossier: { companyId: string | null },
): boolean => doc.visibleEntreprise && !(doc.kind === 'convention' && conventionAuReferent(dossier));

/**
 * La clé de rangement d'une convention, la même quel que soit le chemin qui la
 * produit (dossier, séance, acceptation d'une proposition, envoi depuis la
 * séance) : une seule convention courante par dossier, payeur et groupe —
 * régénérer en crée une nouvelle version, jamais un doublon (audit du point
 * Capsule IA, 06/10/2026).
 */
export const cleConvention = (dossierId: string, payeur: string | null = null, groupeId: string | null = null): string =>
  `convention:${dossierId}:${payeur ?? 'reste'}${groupeId ? `:${groupeId}` : ''}`;
