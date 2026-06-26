import { z } from 'zod';

export const MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;
export type Modality = (typeof MODALITIES)[number];

export function derivePrimaryModality(modalities: readonly Modality[]): Modality {
  const first = modalities[0];
  if (!first) throw new Error('modalities_empty');
  return first;
}

export const ModalitiesSchema = z.array(z.enum(MODALITIES)).min(1).max(3);
