import { z } from 'zod';

export const OrgRepresentativeSchema = z.object({
  representativeName: z.string().trim().max(120).nullable(),
  representativeTitle: z.string().trim().max(120).nullable(),
});
export type OrgRepresentativeInput = z.infer<typeof OrgRepresentativeSchema>;

// Upload : le fichier est envoyé en base64 (data URL décodée côté action).
export const OrgAssetUploadSchema = z.object({
  kind: z.enum(['signature', 'stamp', 'logo']),
  pngBase64: z.string().min(1),
});
export type OrgAssetUploadInput = z.infer<typeof OrgAssetUploadSchema>;
