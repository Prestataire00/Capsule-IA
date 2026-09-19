'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, CalendarPlus, Check, CheckCircle2, FolderOpen, Loader2, RotateCcw, Trash2, User } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/features/tasks/schemas';
import type { Task, TeamMember } from '@/features/tasks/load-tasks';
import { REPORTS_RAPIDES, ajouterJours, jourParis } from '@/features/tasks/dates';
import { assignTask, deleteTask, postponeTask, updateTaskStatus } from './actions';
import { CONTENU_RICHE } from './contenu-riche';

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

const action =
  'inline-flex items-center gap-1 text-[12px] font-medium px-2 h-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-300 shrink-0 transition disabled:opacity-50';

/** Une tâche : clôture, report, avancement, attribution et suppression sur place. */
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
  const [reporter, setReporter] = useState(false);
  const [dateChoisie, setDateChoisie] = useState('');

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
          <p className={`text-[13px] font-medium text-zinc-900 dark:text-zinc-100 ${terminee ? 'line-through' : ''}`}>
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
          {task.descriptionHtml && (
            <div
              className={`${CONTENU_RICHE} text-[12px] text-zinc-600 dark:text-zinc-400 mt-1`}
              // HTML nettoyé côté serveur, à l'écriture comme à la relecture (features/tasks/rich-description.ts).
              dangerouslySetInnerHTML={{ __html: task.descriptionHtml }}
            />
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

        {terminee ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => agir(() => updateTaskStatus({ taskId: task.id, status: 'todo' }))}
            className={action}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Rouvrir
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => agir(() => updateTaskStatus({ taskId: task.id, status: 'done' }))}
              className={`${action} hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-300`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Clôturer
            </button>
            <button
              type="button"
              disabled={pending}
              aria-expanded={reporter}
              onClick={() => setReporter((v) => !v)}
              className={action}
            >
              <CalendarPlus className="w-3.5 h-3.5" aria-hidden /> Reporter
            </button>
          </>
        )}

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

      {reporter && !terminee && (
        <div className="mt-2 ml-8 flex flex-wrap items-center gap-1.5" role="group" aria-label="Reporter l’échéance">
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Reporter à :</span>
          {REPORTS_RAPIDES.map((r) => (
            <button
              key={r.jours}
              type="button"
              disabled={pending}
              onClick={() => {
                setReporter(false);
                agir(() => postponeTask({ taskId: task.id, dueDate: ajouterJours(jourParis(), r.jours) }));
              }}
              className={action}
            >
              {r.label}
            </button>
          ))}
          <input
            type="date"
            min={jourParis()}
            value={dateChoisie}
            onChange={(e) => setDateChoisie(e.target.value)}
            aria-label="Choisir la nouvelle échéance"
            className={`${mini} tabular-nums`}
          />
          <button
            type="button"
            disabled={pending || !dateChoisie}
            onClick={() => {
              setReporter(false);
              const d = dateChoisie;
              setDateChoisie('');
              agir(() => postponeTask({ taskId: task.id, dueDate: d }));
            }}
            className={action}
          >
            Reporter à cette date
          </button>
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-red-600 dark:text-red-400 mt-1.5 ml-8">
          {erreur}
        </p>
      )}
    </li>
  );
}
