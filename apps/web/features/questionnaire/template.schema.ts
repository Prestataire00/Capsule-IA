// ARCHETYPE: shared
// Schéma partagé entre l'éditeur de questionnaires (UI) et les Server Actions.
import { z } from 'zod';
import type { Question, QuestionnaireSchema } from './schema';

export const QUESTION_TYPES = [
  { value: 'text', label: 'Réponse libre' },
  { value: 'choice', label: 'Choix (QCM)' },
  { value: 'rating', label: 'Échelle de notes' },
  { value: 'nps', label: 'NPS (0–10)' },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]['value'];

export const TEMPLATE_KINDS = [
  { value: 'positionnement', label: 'Analyse des besoins / Positionnement' },
  { value: 'satisfaction_chaud', label: 'Satisfaction à chaud' },
  { value: 'satisfaction_froid', label: 'Satisfaction à froid' },
  { value: 'evaluation_acquis', label: 'Évaluation des acquis' },
  { value: 'opco', label: 'Financeur / OPCO' },
  { value: 'satisfaction_formateur', label: 'Satisfaction formateur' },
  { value: 'custom', label: 'Personnalisé' },
] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]['value'];

/** Question telle que manipulée dans l'éditeur (champs surnuméraires tolérés). */
export const questionDraftSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Identifiant requis')
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'minuscules, chiffres et _ uniquement'),
  type: z.enum(['text', 'choice', 'rating', 'nps']),
  label: z.string().trim().min(1, 'Intitulé requis').max(500),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1)).max(20).default([]),
  max: z.coerce.number().int().min(2).max(10).default(5),
});

export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export const templateFormSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  kind: z.enum([
    'positionnement',
    'satisfaction_chaud',
    'satisfaction_froid',
    'evaluation_acquis',
    'opco',
    'satisfaction_formateur',
    'custom',
  ]),
  thankYou: z.string().trim().max(500),
  questions: z
    .array(questionDraftSchema)
    .min(1, 'Au moins une question')
    .max(40)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, {
      message: 'Identifiants de questions en double',
    })
    .refine((qs) => qs.every((q) => q.type !== 'choice' || q.options.length >= 2), {
      message: 'Une question QCM doit avoir au moins 2 options',
    }),
});

export type TemplateFormValues = z.infer<typeof templateFormSchema>;

export const emptyQuestionDraft = (index: number): QuestionDraft => ({
  id: `q${index + 1}`,
  type: 'text',
  label: '',
  required: true,
  options: [],
  max: 5,
});

export const emptyTemplateValues: TemplateFormValues = {
  title: '',
  kind: 'positionnement',
  thankYou: 'Merci, vos réponses ont bien été enregistrées.',
  questions: [emptyQuestionDraft(0)],
};

/** Convertit une question d'éditeur en question runtime propre (stockée en JSONB). */
export function toRuntimeQuestion(q: QuestionDraft): Question {
  switch (q.type) {
    case 'choice':
      return { id: q.id, type: 'choice', label: q.label, required: q.required, options: q.options };
    case 'rating':
      return { id: q.id, type: 'rating', label: q.label, required: q.required, max: q.max };
    case 'nps':
      return { id: q.id, type: 'nps', label: q.label, required: q.required };
    default:
      return { id: q.id, type: 'text', label: q.label, required: q.required };
  }
}

export function toRuntimeSchema(values: TemplateFormValues): QuestionnaireSchema {
  return { questions: values.questions.map(toRuntimeQuestion) };
}

/** Question runtime → brouillon d'éditeur (édition d'un template existant). */
export function toDraftQuestion(q: Question): QuestionDraft {
  return {
    id: q.id,
    type: q.type,
    label: q.label,
    required: q.required,
    options: q.type === 'choice' ? q.options : [],
    max: q.type === 'rating' ? q.max : 5,
  };
}
