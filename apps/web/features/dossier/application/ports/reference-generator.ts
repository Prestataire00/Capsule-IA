import type { OrganizationId } from '../../domain/ids';
import type { DossierReference } from '../../domain/value-objects/dossier-reference';

export interface ReferenceGenerator {
  /** Génère le prochain numéro 'DOS-YYYY-NNNN' pour cet OF (atomique). */
  nextDossierReference(orgId: OrganizationId, year: number): Promise<DossierReference>;
}

export interface IdGenerator {
  newUuidV7(): string;
}
