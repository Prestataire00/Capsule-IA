'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { roleConnu } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import {
  assignTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  postponeTaskSchema,
  updateTaskStatusSchema,
  type CreateTaskInput,
  type PostponeTaskInput,
} from '@/features/tasks/schemas';
import { nettoyerDetail } from '@/features/tasks/rich-description';
import { jourParis } from '@/features/tasks/dates';

/**
 * Tâches internes : création, attribution, avancement, report, suppression.
 *
 * La table n'est écrivable qu'en service role : chaque action vérifie donc
 * explicitement le compte, son organisation, et — pour modifier une tâche
 * existante — qu'il en est le créateur, la personne assignée, ou un
 * responsable. Sans quoi un identifiant de tâche suffirait à agir dessus.
 */

type Result = { ok: true } | { ok: false; error: string };

const RESPONSABLES = ['owner', 'admin', 'gestionnaire'];

// `app.tasks` n'est pas dans les types générés (migration 0159).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

type Membre = { userId: string; organizationId: string; role: string };

async function garde(): Promise<{ ok: true; membre: Membre } | { ok: false; error: string }> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (!roleConnu(membre.role)) return { ok: false, error: 'Votre rôle ne permet pas de gérer des tâches.' };
  return { ok: true, membre: { userId: membre.userId, organizationId: membre.organizationId, role: membre.role } };
}

/** La personne visée est-elle membre de la même organisation ? */
async function membreDeLOrganisation(userId: string, organizationId: string): Promise<boolean> {
  const { data } = await admin()
    .schema('app')
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return data !== null;
}

type TacheRef = { id: string; organization_id: string; created_by: string | null; assignee_user_id: string | null; title: string };

/** Tâche de l'organisation du membre, qu'il a le droit de modifier. */
async function tacheModifiable(
  taskId: string,
  membre: Membre,
): Promise<{ ok: true; tache: TacheRef } | { ok: false; error: string }> {
  const { data } = await admin()
    .schema('app')
    .from('tasks')
    .select('id, organization_id, created_by, assignee_user_id, title')
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
  const tache = data as TacheRef | null;
  if (!tache || tache.organization_id !== membre.organizationId) return { ok: false, error: 'Tâche introuvable.' };

  const autorise =
    RESPONSABLES.includes(membre.role) ||
    tache.created_by === membre.userId ||
    tache.assignee_user_id === membre.userId;
  if (!autorise) return { ok: false, error: 'Cette tâche est suivie par quelqu’un d’autre.' };
  return { ok: true, tache };
}

/** Prévient la personne assignée (in-app), sauf si elle s'attribue la tâche elle-même. */
async function notifierAssignation(args: {
  organizationId: string;
  assigneeUserId: string;
  auteurUserId: string;
  taskId: string;
  title: string;
}): Promise<void> {
  if (args.assigneeUserId === args.auteurUserId) return;
  const { error } = await admin()
    .schema('app')
    .from('notifications')
    .insert({
      organization_id: args.organizationId,
      channel: 'in_app',
      template_code: 'task_assigned',
      recipient_user_id: args.assigneeUserId,
      subject: `Nouvelle tâche : ${args.title}`,
      payload: { task_id: args.taskId, title: args.title },
      status: 'sent',
      sent_at: new Date().toISOString(),
      related_aggregate_type: 'task',
      related_aggregate_id: args.taskId,
    } as never);
  if (error) console.error('[tâches] notification non enregistrée', error.message);
}

export async function createTask(input: CreateTaskInput): Promise<Result> {
  const p = createTaskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde();
  if (!g.ok) return g;
  const v = p.data;

  if (v.assigneeUserId && !(await membreDeLOrganisation(v.assigneeUserId, g.membre.organizationId))) {
    return { ok: false, error: 'Cette personne n’est pas membre de votre équipe.' };
  }

  const { data, error } = await admin()
    .schema('app')
    .from('tasks')
    .insert({
      organization_id: g.membre.organizationId,
      title: v.title,
      // HTML de l'éditeur riche : seules les balises et styles qu'il produit survivent.
      description: v.description ? nettoyerDetail(v.description) || null : null,
      assignee_user_id: v.assigneeUserId || null,
      priority: v.priority,
      due_date: v.dueDate || null,
      dossier_id: v.dossierId || null,
      session_id: v.sessionId || null,
      created_by: g.membre.userId,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    console.error('[tâches] création impossible', error?.message);
    return { ok: false, error: 'La tâche n’a pas pu être créée.' };
  }

  if (v.assigneeUserId) {
    await notifierAssignation({
      organizationId: g.membre.organizationId,
      assigneeUserId: v.assigneeUserId,
      auteurUserId: g.membre.userId,
      taskId: (data as { id: string }).id,
      title: v.title,
    });
  }

  revalidatePath('/taches');
  return { ok: true };
}

export async function updateTaskStatus(input: { taskId: string; status: string }): Promise<Result> {
  const p = updateTaskStatusSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Statut inconnu.' };
  const g = await garde();
  if (!g.ok) return g;
  const acces = await tacheModifiable(p.data.taskId, g.membre);
  if (!acces.ok) return acces;

  const { error } = await admin()
    .schema('app')
    .from('tasks')
    .update({
      status: p.data.status,
      done_at: p.data.status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', p.data.taskId)
    .eq('organization_id', g.membre.organizationId);
  if (error) {
    console.error('[tâches] statut non enregistré', error.message);
    return { ok: false, error: 'Le statut n’a pas pu être enregistré.' };
  }

  revalidatePath('/taches');
  return { ok: true };
}

/** Reporter l'échéance d'une tâche — jamais dans le passé, à l'heure de Paris. */
export async function postponeTask(input: PostponeTaskInput): Promise<Result> {
  const p = postponeTaskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Date de report invalide.' };
  const g = await garde();
  if (!g.ok) return g;
  const acces = await tacheModifiable(p.data.taskId, g.membre);
  if (!acces.ok) return acces;

  if (p.data.dueDate < jourParis()) return { ok: false, error: 'On ne reporte pas une tâche dans le passé.' };

  const { error } = await admin()
    .schema('app')
    .from('tasks')
    .update({ due_date: p.data.dueDate, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.taskId)
    .eq('organization_id', g.membre.organizationId);
  if (error) {
    console.error('[tâches] report non enregistré', error.message);
    return { ok: false, error: 'Le report n’a pas pu être enregistré.' };
  }

  revalidatePath('/taches');
  return { ok: true };
}

export async function assignTask(input: { taskId: string; assigneeUserId: string }): Promise<Result> {
  const p = assignTaskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Attribution invalide.' };
  const g = await garde();
  if (!g.ok) return g;
  const acces = await tacheModifiable(p.data.taskId, g.membre);
  if (!acces.ok) return acces;

  if (p.data.assigneeUserId && !(await membreDeLOrganisation(p.data.assigneeUserId, g.membre.organizationId))) {
    return { ok: false, error: 'Cette personne n’est pas membre de votre équipe.' };
  }

  const { error } = await admin()
    .schema('app')
    .from('tasks')
    .update({ assignee_user_id: p.data.assigneeUserId || null, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.taskId)
    .eq('organization_id', g.membre.organizationId);
  if (error) {
    console.error('[tâches] attribution non enregistrée', error.message);
    return { ok: false, error: 'L’attribution n’a pas pu être enregistrée.' };
  }

  if (p.data.assigneeUserId) {
    await notifierAssignation({
      organizationId: g.membre.organizationId,
      assigneeUserId: p.data.assigneeUserId,
      auteurUserId: g.membre.userId,
      taskId: p.data.taskId,
      title: acces.tache.title,
    });
  }

  revalidatePath('/taches');
  return { ok: true };
}

export async function deleteTask(input: { taskId: string }): Promise<Result> {
  const p = deleteTaskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Tâche inconnue.' };
  const g = await garde();
  if (!g.ok) return g;

  const acces = await tacheModifiable(p.data.taskId, g.membre);
  if (!acces.ok) return acces;
  // Supprimer la tâche de quelqu'un d'autre reste réservé à son créateur et aux
  // responsables : la personne assignée l'avance, elle ne l'efface pas.
  if (!RESPONSABLES.includes(g.membre.role) && acces.tache.created_by !== g.membre.userId) {
    return { ok: false, error: 'Seul le créateur de la tâche peut la supprimer.' };
  }

  const { error } = await admin()
    .schema('app')
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', p.data.taskId)
    .eq('organization_id', g.membre.organizationId);
  if (error) {
    console.error('[tâches] suppression impossible', error.message);
    return { ok: false, error: 'La tâche n’a pas pu être supprimée.' };
  }

  revalidatePath('/taches');
  return { ok: true };
}
