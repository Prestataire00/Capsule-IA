/**
 * Règles de diffusion d'un support de cours (0165). Module pur : la même
 * décision doit valoir dans la page du formateur, dans la file de validation
 * et dans l'espace apprenant — trois endroits, une seule règle.
 */

export const SUPPORT_STATUSES = ['en_attente', 'valide', 'refuse'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  en_attente: 'À valider',
  valide: 'Validé',
  refuse: 'À corriger',
};

/**
 * Qui ouvre un support aux apprenants.
 *
 * Volontairement plus étroit que la matrice de rôles : l'organisme répond de ce
 * qu'il diffuse, donc la décision revient à la direction et aux validateurs
 * qu'elle a désignés (0203) — jamais au formateur qui a déposé le fichier.
 */
export function peutValiderSupports(role: string | null | undefined, estValidateurDesigne = false): boolean {
  return estValidateurDesigne || role === 'owner' || role === 'admin';
}

export const ROLES_VALIDATION = ['validateur', 'copie'] as const;
export type RoleValidation = (typeof ROLES_VALIDATION)[number];

/**
 * Qui reçoit un contenu à relire (0203) : les validateurs désignés, sinon la
 * direction. La copie ne doublonne jamais un validateur — on ne reçoit pas
 * deux fois le même e-mail.
 */
export function destinatairesValidation(
  designations: ReadonlyArray<{ userId: string; role: RoleValidation }>,
  direction: readonly string[],
): { validateurs: string[]; copie: string[] } {
  const designes = [...new Set(designations.filter((d) => d.role === 'validateur').map((d) => d.userId))];
  const validateurs = designes.length > 0 ? designes : [...new Set(direction)];
  const copie = [
    ...new Set(designations.filter((d) => d.role === 'copie').map((d) => d.userId)),
  ].filter((id) => !validateurs.includes(id));
  return { validateurs, copie };
}

/**
 * Un apprenant ne voit un support que si l'administration l'a validé ET que le
 * formateur le propose toujours : les deux conditions, jamais l'une seule.
 */
export function estVisibleParApprenant(support: {
  validationStatus: SupportStatus;
  isPublished: boolean;
}): boolean {
  return support.validationStatus === 'valide' && support.isPublished;
}

/** Un refus n'est pas définitif : le formateur corrige et redépose. */
export function peutResoumettre(validationStatus: SupportStatus): boolean {
  return validationStatus === 'refuse';
}

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === 'string' && (SUPPORT_STATUSES as readonly string[]).includes(value);
}
