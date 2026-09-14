// ARCHETYPE: shared
// Schémas partagés entre le formulaire de tâche et les Server Actions (0159).
import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

/** Longueur maximale du détail, balises HTML comprises (contrainte 0160). */
export const DETAIL_MAX = 50_000;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Basse',
  medium: 'Normale',
  high: 'Haute',
};

const dateOuVide = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Échéance : date invalide');

const uuidOuVide = z
  .string()
  .trim()
  .refine((v) => v === '' || z.string().uuid().safeParse(v).success, 'Identifiant invalide');

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis').max(200, 'Titre : 200 caractères au plus'),
  /** HTML de l'éditeur riche, nettoyé par l'action avant enregistrement. */
  description: z.string().trim().max(DETAIL_MAX, 'Détail trop long, tableaux compris'),
  /** Vide = tâche non attribuée (à prendre). */
  assigneeUserId: uuidOuVide,
  priority: z.enum(TASK_PRIORITIES),
  dueDate: dateOuVide,
  dossierId: uuidOuVide,
  sessionId: uuidOuVide,
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(TASK_STATUSES),
});

export const assignTaskSchema = z.object({
  taskId: z.string().uuid(),
  /** Vide = retirer l'attribution. */
  assigneeUserId: uuidOuVide,
});

export const deleteTaskSchema = z.object({ taskId: z.string().uuid() });

export const postponeTaskSchema = z.object({
  taskId: z.string().uuid(),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de report invalide'),
});

export type PostponeTaskInput = z.input<typeof postponeTaskSchema>;

/** FormData → objet plat, pour un `safeParse` direct. */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}
