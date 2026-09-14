import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskPriority, TaskStatus } from './schemas';

/**
 * Tâches de l'organisation et membres attribuables.
 *
 * Lecture sous RLS (`tasks_select` borne à l'organisation) : la page n'a pas
 * besoin de service role. Les noms viennent de `app.profiles`, comme la page
 * Membres — on ne recopie pas l'identité des comptes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type TeamMember = {
  readonly userId: string;
  readonly name: string;
  readonly role: string;
};

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: string | null;
  readonly doneAt: string | null;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly createdByUserId: string | null;
  readonly createdByName: string | null;
  readonly dossierId: string | null;
  readonly dossierReference: string | null;
  readonly sessionId: string | null;
  readonly createdAt: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  done_at: string | null;
  assignee_user_id: string | null;
  created_by: string | null;
  dossier_id: string | null;
  session_id: string | null;
  created_at: string;
};

export async function loadTeamMembers(sb: Client): Promise<TeamMember[]> {
  const { data: membres } = await sb
    .schema('app')
    .from('members')
    .select('user_id, role')
    .is('deleted_at', null);
  const rows = ((membres ?? []) as { user_id: string; role: string }[]).filter((m) => m.user_id);
  if (rows.length === 0) return [];

  const { data: profils } = await sb
    .schema('app')
    .from('profiles')
    .select('user_id, full_name, email')
    .in(
      'user_id',
      rows.map((m) => m.user_id),
    );
  const parUtilisateur = new Map(
    ((profils ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).map((p) => [p.user_id, p]),
  );

  return rows
    .map((m) => {
      const p = parUtilisateur.get(m.user_id);
      return {
        userId: m.user_id,
        name: p?.full_name?.trim() || p?.email || 'Membre',
        role: m.role,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * `null` = la table n'existe pas encore en base (migration 0159 non appliquée).
 * La page l'affiche alors explicitement, au lieu de planter : l'application des
 * migrations en production a déjà pris du retard par le passé (audit CAP-04).
 */
export async function loadTasks(sb: Client, membres: readonly TeamMember[]): Promise<Task[] | null> {
  const { data, error } = await sb
    .schema('app')
    .from('tasks')
    .select(
      'id, title, description, status, priority, due_date, done_at, assignee_user_id, created_by, dossier_id, session_id, created_at',
    )
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[tâches] lecture impossible', error.message);
    return null;
  }
  const rows = (data ?? []) as TaskRow[];
  if (rows.length === 0) return [];

  const nom = new Map(membres.map((m) => [m.userId, m.name]));

  // Référence du dossier lié, pour ne pas afficher un UUID nu.
  const dossierIds = [...new Set(rows.map((r) => r.dossier_id).filter((v): v is string => Boolean(v)))];
  const { data: dossiers } = dossierIds.length
    ? await sb.schema('app').from('dossiers').select('id, reference').in('id', dossierIds)
    : { data: [] };
  const reference = new Map(((dossiers ?? []) as { id: string; reference: string }[]).map((d) => [d.id, d.reference]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    doneAt: r.done_at,
    assigneeUserId: r.assignee_user_id,
    assigneeName: r.assignee_user_id ? (nom.get(r.assignee_user_id) ?? 'Membre') : null,
    createdByUserId: r.created_by,
    createdByName: r.created_by ? (nom.get(r.created_by) ?? null) : null,
    dossierId: r.dossier_id,
    dossierReference: r.dossier_id ? (reference.get(r.dossier_id) ?? null) : null,
    sessionId: r.session_id,
    createdAt: r.created_at,
  }));
}

/** Une tâche non terminée dont l'échéance est passée. */
export const enRetard = (t: Task, aujourdHui = new Date()): boolean =>
  t.status !== 'done' && !!t.dueDate && t.dueDate < aujourdHui.toISOString().slice(0, 10);
