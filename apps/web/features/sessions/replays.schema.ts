import { z } from 'zod';

/** Le replay d'une séance — partagé entre les formulaires et leurs actions. */
export const replaySchema = z.object({
  sessionId: z.string().uuid(),
  url: z.string().trim().min(8, 'Collez le lien de partage du replay.').max(2000),
  titre: z.string().trim().max(200).optional(),
});
