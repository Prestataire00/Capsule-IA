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

// Le RIB déposé tel quel : PDF ou image, joint en dernière page des factures.
export const OrgRibUploadSchema = z.object({
  type: z.enum(['pdf', 'png', 'jpg']),
  base64: z.string().min(1),
});
export type OrgRibUploadInput = z.infer<typeof OrgRibUploadSchema>;
