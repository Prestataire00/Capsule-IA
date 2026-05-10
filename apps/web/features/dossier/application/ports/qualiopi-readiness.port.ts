import type { DossierId } from '../../domain/ids';
import type { ClosingChecklist } from '../../domain/dossier.entity';

export interface QualiopiReadinessPort {
  computeClosingChecklist(dossierId: DossierId): Promise<ClosingChecklist>;
}
