import { z } from 'zod';

export const SIGNER_KINDS = ['learner', 'company_rep', 'org_rep'] as const;
export type SignerKind = (typeof SIGNER_KINDS)[number];

export const SIGNER_KIND_LABELS: Record<SignerKind, string> = {
  learner: 'Apprenant',
  company_rep: "Représentant de l'entreprise",
  org_rep: "Représentant de l'organisme",
};

export const RequestSignaturesSchema = z.object({
  documentId: z.string().uuid(),
  signers: z
    .array(
      z.object({
        kind: z.enum(SIGNER_KINDS),
        name: z.string().min(1, 'Nom requis').max(160),
        email: z.string().email('Email invalide'),
        learnerId: z.string().uuid().nullable().default(null),
      }),
    )
    .min(1, 'Au moins un signataire')
    .max(5),
});
export type RequestSignaturesValues = z.infer<typeof RequestSignaturesSchema>;
