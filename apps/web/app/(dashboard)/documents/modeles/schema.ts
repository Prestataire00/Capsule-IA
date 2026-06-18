import { z } from 'zod';

// Types de documents autorisés (CHECK de app.document_templates, cf. migration 0009).
export const TEMPLATE_KINDS = [
  'convention',
  'convocation',
  'programme',
  'attestation_presence',
  'attestation_fin',
  'certificat_realisation',
  'reglement_interieur',
  'livret_accueil',
  'devis',
  'facture',
  'feuille_emargement',
  'questionnaire',
  'autre',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  convention: 'Convention',
  convocation: 'Convocation',
  programme: 'Programme',
  attestation_presence: 'Attestation de présence',
  attestation_fin: 'Attestation de fin',
  certificat_realisation: 'Certificat de réalisation',
  reglement_interieur: 'Règlement intérieur',
  livret_accueil: "Livret d'accueil",
  devis: 'Devis',
  facture: 'Facture',
  feuille_emargement: "Feuille d'émargement",
  questionnaire: 'Questionnaire',
  autre: 'Autre',
};

export const SaveTemplateSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  kind: z.enum(TEMPLATE_KINDS),
  title: z.string().min(1, 'Titre requis').max(200),
  contentHtml: z.string().min(1, 'Contenu requis').max(100_000),
});
export type SaveTemplateValues = z.infer<typeof SaveTemplateSchema>;

export const DeleteTemplateSchema = z.object({ id: z.string().uuid() });

export const GenerateFromTemplateSchema = z.object({
  dossierId: z.string().uuid(),
  templateId: z.string().uuid(),
});
