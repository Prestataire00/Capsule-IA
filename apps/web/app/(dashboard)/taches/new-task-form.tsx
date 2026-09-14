'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { PRIORITY_LABELS, TASK_PRIORITIES, type TaskPriority } from '@/features/tasks/schemas';
import type { TeamMember } from '@/features/tasks/load-tasks';
import { createTask } from './actions';

const champ =
  'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

const VIDE = { title: '', description: '', assigneeUserId: '', priority: 'medium' as TaskPriority, dueDate: '' };

/** Création d'une tâche : titre, personne, échéance, priorité. */
export function NewTaskForm({ membres, moi }: { membres: TeamMember[]; moi: string | null }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState({ ...VIDE, assigneeUserId: moi ?? '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 transition"
      >
        <Plus className="w-4 h-4" /> Nouvelle tâche
      </button>
    );
  }

  return (
    <form
      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        start(async () => {
          const r = await createTask({ ...f, dossierId: '', sessionId: '' });
          if (!r.ok) {
            setErreur(r.error);
            return;
          }
          setF({ ...VIDE, assigneeUserId: moi ?? '' });
          setOuvert(false);
          router.refresh();
        });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Nouvelle tâche</p>
        <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Intitulé</span>
        <input
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          maxLength={200}
          required
          autoFocus
          placeholder="Ex. Relancer l’OPCO du dossier Martin"
          className={champ}
        />
      </label>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Attribuée à</span>
          <select value={f.assigneeUserId} onChange={(e) => setF({ ...f, assigneeUserId: e.target.value })} className={champ}>
            <option value="">Personne (à prendre)</option>
            {membres.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === moi ? `${m.name} (moi)` : m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Échéance</span>
          <input
            type="date"
            value={f.dueDate}
            onChange={(e) => setF({ ...f, dueDate: e.target.value })}
            className={`${champ} tabular-nums`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Priorité</span>
          <select
            value={f.priority}
            onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}
            className={champ}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Détail (facultatif)</span>
        <textarea
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          rows={3}
          maxLength={4000}
          className={champ}
        />
      </label>

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-red-600 dark:text-red-400">
          {erreur}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || f.title.trim() === ''}
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-9 rounded-lg disabled:opacity-40"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Créer la tâche
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="text-[13px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2">
          Annuler
        </button>
      </div>
    </form>
  );
}
