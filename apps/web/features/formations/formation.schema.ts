// ARCHETYPE: shared
// Schéma Zod partagé entre le formulaire (react-hook-form) et les Server Actions.
// Convention : tous les champs de saisie sont des string / boolean / string[].
// La conversion nombre → cents/entiers est centralisée dans mapping.ts (source unique).

import { z } from 'zod';

const positiveNumberString = z
  .string()
  .trim()
  .refine((v) => v !== '' && Number.isFinite(Number(v)) && Number(v) > 0, {
    message: 'Valeur strictement positive requise',
  });

const optionalNonNegativeNumberString = z
  .string()
  .trim()
  .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), {
    message: 'Nombre positif ou vide',
  });

export const formationFormSchema = z.object({
  // ── Section 1 : Infos générales ──────────────────────────────────────────
  title: z.string().trim().min(1, 'Le titre est requis').max(200),
  subtitle: z.string().trim().max(300),
  code: z.string().trim().max(60),
  version: z.string().trim().max(10),
  description: z.string().max(20000), // HTML riche
  modality: z.enum(['presentiel', 'distanciel', 'hybride', 'afest']),
  durationHours: positiveNumberString,
  durationDays: optionalNonNegativeNumberString,
  effectifMin: optionalNonNegativeNumberString,
  effectifMax: optionalNonNegativeNumberString,
  status: z.enum(['draft', 'published', 'archived']),
  priceBase: optionalNonNegativeNumberString,
  priceEntreprise: optionalNonNegativeNumberString,
  priceParticulier: optionalNonNegativeNumberString,
  priceIndependant: optionalNonNegativeNumberString,
  categories: z.array(z.string()).max(20),
  imageUrl: z.string().trim().max(1000),
  videoUrl: z.string().trim().max(1000),
  eligibleCpf: z.boolean(),
  publishedToCatalog: z.boolean(),
  defaultLocation: z.string().trim().max(200),
  defaultCity: z.string().trim().max(120),
  defaultDepartment: z.string().trim().max(120),

  // ── Section 2 : Type d'action & certification ────────────────────────────
  actionType: z.enum([
    'action_formation',
    'bilan_competences',
    'vae',
    'apprentissage',
    'formation_continue',
    'formation_initiale',
  ]),
  isDpc: z.boolean(),
  diplomeVise: z.string().trim().max(200),
  titreVise: z.string().trim().max(200),
  codeNsf: z.string().trim().max(10),
  certifying: z.boolean(),
  qualifying: z.boolean(),
  certificationObtention: z.string().max(5000),
  certificationDetails: z.string().max(5000),
  validityValue: optionalNonNegativeNumberString,
  validityUnit: z.enum(['annees', 'mois']),
  recyclingEnabled: z.boolean(),
  recyclingReminderValue: optionalNonNegativeNumberString,
  recyclingReminderUnit: z.enum(['annees', 'mois']),
  certifType: z.enum(['sans', 'rncp', 'rs', 'cqp']),
  rncpCode: z.string().trim().max(40),
  rsCode: z.string().trim().max(40),
  certificateur: z.string().trim().max(200),
  certifEmetteur: z.string().trim().max(200),
  certifNomCertificateur: z.string().trim().max(200),
  certifIdentifiantCertificateur: z.string().trim().max(200),
  certifNumeroContrat: z.string().trim().max(200),
  certifModaliteAcces: z.string().trim().max(300),
  certifModaliteObtention: z.string().trim().max(300),
  certifDateEnregistrement: z.string().trim().max(20),
  certifDonneeCertifiee: z.boolean(),
  fundingTypes: z.array(z.string()).max(12),

  // ── Section 3 : Contenu pédagogique ──────────────────────────────────────
  programContent: z.string().max(50000), // HTML riche
  objectives: z.array(z.string()).max(60),
  targetAudience: z.string().max(5000),
  pedagogicalMethod: z.string().max(10000), // HTML riche
  teachingTeam: z.string().max(10000), // HTML riche
  defaultTrainerId: z.string().trim().max(60),
  deroulement: z.string().max(10000),

  // ── Section 4 : Évaluation & résultats ───────────────────────────────────
  evaluationMethod: z.string().max(10000), // HTML riche
  resultIndicators: z.string().max(10000), // HTML riche

  // ── Section 5 : Accessibilité & contact ──────────────────────────────────
  prerequisites: z.array(z.string()).max(60),
  accessibilityInfo: z.string().max(10000), // HTML riche
  accessDelay: z.string().max(5000),
  referentContact: z.string().trim().max(300),
  referentHandicap: z.string().trim().max(300),
});

export type FormationFormValues = z.infer<typeof formationFormSchema>;

export const emptyFormationValues: FormationFormValues = {
  title: '',
  subtitle: '',
  code: '',
  version: '1',
  description: '',
  modality: 'presentiel',
  durationHours: '',
  durationDays: '',
  effectifMin: '',
  effectifMax: '',
  status: 'draft',
  priceBase: '',
  priceEntreprise: '',
  priceParticulier: '',
  priceIndependant: '',
  categories: [],
  imageUrl: '',
  videoUrl: '',
  eligibleCpf: false,
  publishedToCatalog: false,
  defaultLocation: '',
  defaultCity: '',
  defaultDepartment: '',

  actionType: 'action_formation',
  isDpc: false,
  diplomeVise: '',
  titreVise: '',
  codeNsf: '',
  certifying: false,
  qualifying: false,
  certificationObtention: '',
  certificationDetails: '',
  validityValue: '',
  validityUnit: 'annees',
  recyclingEnabled: false,
  recyclingReminderValue: '',
  recyclingReminderUnit: 'mois',
  certifType: 'sans',
  rncpCode: '',
  rsCode: '',
  certificateur: '',
  certifEmetteur: '',
  certifNomCertificateur: '',
  certifIdentifiantCertificateur: '',
  certifNumeroContrat: '',
  certifModaliteAcces: '',
  certifModaliteObtention: '',
  certifDateEnregistrement: '',
  certifDonneeCertifiee: false,
  fundingTypes: [],

  programContent: '',
  objectives: [],
  targetAudience: '',
  pedagogicalMethod: '',
  teachingTeam: '',
  defaultTrainerId: '',
  deroulement: '',

  evaluationMethod: '',
  resultIndicators: '',

  prerequisites: [],
  accessibilityInfo: '',
  accessDelay: '',
  referentContact: '',
  referentHandicap: '',
};
