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
 * qu'il diffuse, donc la décision revient à la direction — jamais au
 * formateur qui a déposé le fichier.
 */
export function peutValiderSupports(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Qui reçoit un contenu à relire : la direction valide (l'un suffit), les
 * gestionnaires suivent en copie. Rien à désigner : le rôle de chacun dans
 * Paramètres → Membres suffit.
 */
export function destinatairesValidation(
  membres: ReadonlyArray<{ userId: string; role: string }>,
): { validateurs: string[]; copie: string[] } {
  const validateurs = [...new Set(membres.filter((m) => peutValiderSupports(m.role)).map((m) => m.userId))];
  const copie = [...new Set(membres.filter((m) => m.role === 'gestionnaire').map((m) => m.userId))].filter(
    (id) => !validateurs.includes(id),
  );
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
