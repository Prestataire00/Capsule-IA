'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, FolderOpen, Loader2, Trash2, User } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/features/tasks/schemas';
import type { Task, TeamMember } from '@/features/tasks/load-tasks';
import { assignTask, deleteTask, updateTaskStatus } from './actions';

const PRIORITE: Record<TaskPriority, string> = {
  high: ACCENTS.rose.soft,
  medium: ACCENTS.amber.soft,
  low: ACCENTS.sky.soft,
};

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', year: '2-digit' }).format(
    new Date(iso),
  );

const mini =
  'text-[12px] px-2 h-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

/** Une tâche : avancement, attribution et suppression sur place. */
export function TaskRow({
  task,
  membres,
  moi,
  retard,
}: {
  task: Task;
  membres: TeamMember[];
  moi: string | null;
  retard: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setErreur(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      router.refresh();
    });
  };

  const terminee = task.status === 'done';

  return (
    <li className={`px-4 py-3 ${terminee ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          aria-label={terminee ? 'Rouvrir la tâche' : 'Marquer terminée'}
          disabled={pending}
          onClick={() => agir(() => updateTaskStatus({ taskId: task.id, status: terminee ? 'todo' : 'done' }))}
          className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border transition disabled:opacity-50 ${
            terminee
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-500 text-transparent hover:text-emerald-500'
          }`}
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin text-zinc-400" /> : <Check className="w-3.5 h-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-medium text-zinc-900 dark:text-zinc-100 ${terminee ? 'line-through' : ''}`}>
            {task.title}
          </p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" aria-hidden />
              {task.assigneeName ? (task.assigneeUserId === moi ? 'Moi' : task.assigneeName) : 'Non attribuée'}
            </span>
            {task.dueDate && (
              <span className={`inline-flex items-center gap-1 tabular-nums ${retard ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                <CalendarClock className="w-3 h-3" aria-hidden />
                {retard ? 'En retard depuis le ' : 'Pour le '}
                {dateCourte(task.dueDate)}
              </span>
            )}
            {task.dossierId && (
              <Link href={`/dossiers/${task.dossierId}`} className="inline-flex items-center gap-1 hover:text-orange-600 dark:hover:text-orange-300">
                <FolderOpen className="w-3 h-3" aria-hidden />
                {task.dossierReference ?? 'Dossier'}
              </Link>
            )}
            {task.createdByName && task.createdByUserId !== task.assigneeUserId && <span>Demandée par {task.createdByName}</span>}
          </p>
          {task.description && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1 whitespace-pre-line">{task.description}</p>
          )}
        </div>

        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${PRIORITE[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>

        <select
          aria-label="Avancement"
          value={task.status}
          disabled={pending}
          onChange={(e) => agir(() => updateTaskStatus({ taskId: task.id, status: e.target.value as TaskStatus }))}
          className={`${mini} shrink-0`}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          aria-label="Attribuer à"
          value={task.assigneeUserId ?? ''}
          disabled={pending}
          onChange={(e) => agir(() => assignTask({ taskId: task.id, assigneeUserId: e.target.value }))}
          className={`${mini} shrink-0 max-w-[11rem]`}
        >
          <option value="">Non attribuée</option>
          {membres.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === moi ? `${m.name} (moi)` : m.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-label="Supprimer la tâche"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Supprimer « ${task.title} » ?`)) agir(() => deleteTask({ taskId: task.id }));
          }}
          className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-red-600 dark:text-red-400 mt-1.5 ml-8">
          {erreur}
        </p>
      )}
    </li>
  );
}
