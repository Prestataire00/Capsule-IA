import { z } from 'zod';

/**
 * Amélioration continue : incidents, axes d'amélioration, actions correctives,
 * veille. Schémas partagés entre les formulaires et les Server Actions.
 */

export const INCIDENT_KINDS = ['alea', 'difficulte', 'abandon', 'insatisfaction', 'autre'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = {
  alea: 'Aléa',
  difficulte: 'Difficulté',
  abandon: 'Abandon',
  insatisfaction: 'Insatisfaction',
  autre: 'Autre',
};

export const SEVERITIES = ['faible', 'moyenne', 'elevee'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée' };

export const AXIS_STATUSES = ['a_adresser', 'en_cours', 'optimise'] as const;
export type AxisStatus = (typeof AXIS_STATUSES)[number];
export const AXIS_STATUS_LABELS: Record<AxisStatus, string> = {
  a_adresser: 'À adresser',
  en_cours: 'En cours',
  optimise: 'Optimisé',
};

export const ACTION_ORIGINS = ['reclamation', 'satisfaction', 'audit', 'veille', 'incident', 'autre'] as const;
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];
export const ACTION_ORIGIN_LABELS: Record<ActionOrigin, string> = {
  reclamation: 'Réclamation',
  satisfaction: 'Satisfaction',
  audit: 'Audit',
  veille: 'Veille',
  incident: 'Incident',
  autre: 'Autre',
};

export const ACTION_STATUSES = ['open', 'in_progress', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const VEILLE_CATEGORIES = ['legale', 'metier', 'pedagogique', 'technologique', 'handicap', 'autre'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const titre = z.string().trim().min(1, 'titre_requis').max(200, 'titre_trop_long');
const texte = (max: number) => z.string().trim().max(max, 'texte_trop_long').optional();
const date = z.string().regex(DATE, 'date_invalide').optional();
const uuid = z.string().uuid('identifiant_invalide').optional();

export const incidentSchema = z.object({
  kind: z.enum(INCIDENT_KINDS),
  title: titre,
  description: texte(4000),
  severity: z.enum(SEVERITIES).default('moyenne'),
  occurredOn: date,
});

export const resolveIncidentSchema = z.object({
  id: z.string().uuid('identifiant_invalide'),
  resolution: z.string().trim().min(1, 'resolution_requise').max(4000, 'texte_trop_long'),
});

export const axisSchema = z.object({
  title: titre,
  description: texte(4000),
  indicatorNumber: z.coerce.number().int().min(1).max(33).optional(),
});

export const moveAxisSchema = z.object({
  id: z.string().uuid('identifiant_invalide'),
  status: z.enum(AXIS_STATUSES),
});

export const actionSchema = z.object({
  title: titre,
  origin: z.enum(ACTION_ORIGINS).default('autre'),
  description: texte(4000),
  owner: texte(200),
  priority: z.enum(PRIORITIES).default('medium'),
  dueDate: date,
  complaintId: uuid,
  incidentId: uuid,
  axisId: uuid,
});

export const actionStatusSchema = z.object({
  id: z.string().uuid('identifiant_invalide'),
  status: z.enum(ACTION_STATUSES),
});

export const veilleSchema = z.object({
  category: z.enum(VEILLE_CATEGORIES),
  title: titre,
  summary: texte(4000),
  sourceUrl: z.string().trim().url('url_invalide').max(1000).optional(),
  impact: texte(1000),
});

/** Champs d'un formulaire ; un champ laissé vide vaut « non renseigné ». */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === 'string' && v.trim() !== '') out[k] = v;
  });
  return out;
}
