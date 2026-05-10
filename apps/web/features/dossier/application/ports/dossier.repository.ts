import type { Dossier } from '../../domain/dossier.entity';
import type { DossierId, OrganizationId } from '../../domain/ids';

export interface DossierRepository {
  findById(id: DossierId): Promise<Dossier | null>;
  save(dossier: Dossier): Promise<void>;
  existsByReference(orgId: OrganizationId, reference: string): Promise<boolean>;
}
