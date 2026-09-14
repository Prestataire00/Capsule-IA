// ARCHETYPE: command
// Justification: tâches de l'équipe — créer, attribuer, suivre l'avancement (0159).

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, CircleDot, ListChecks, TriangleAlert } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { KpiCard } from '@/shared/ui/kpi-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { loadTasks, loadTeamMembers, enRetard, type Task } from '@/features/tasks/load-tasks';
import { NewTaskForm } from './new-task-form';
import { TaskRow } from './task-row';

export const dynamic = 'force-dynamic';

type Vue = 'mes' | 'equipe' | 'libres' | 'toutes';

const VUES: { key: Vue; label: string }[] = [
  { key: 'mes', label: 'Mes tâches' },
  { key: 'equipe', label: 'Celles que j’ai attribuées' },
  { key: 'libres', label: 'À prendre' },
  { key: 'toutes', label: 'Toutes' },
];

const vueDe = (v: string | undefined): Vue =>
  v === 'equipe' || v === 'libres' || v === 'toutes' ? v : 'mes';

export default async function TachesPage({ searchParams }: { searchParams?: { vue?: string } }) {
  const membre = await getCurrentMember();
  const moi = membre?.userId ?? null;
  // `app.tasks` n'est pas dans les types générés (migration 0159) ; la lecture
  // reste sous RLS, bornée à l'organisation par la politique `tasks_select`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseServer() as unknown as SupabaseClient<any, any, any>;

  const membres = await loadTeamMembers(sb);
  const toutes = await loadTasks(sb, membres);
  const vue = vueDe(searchParams?.vue);

  const filtrees = toutes.filter((t) => {
    if (vue === 'mes') return t.assigneeUserId === moi;
    if (vue === 'equipe') return t.createdByUserId === moi && t.assigneeUserId !== moi;
    if (vue === 'libres') return t.assigneeUserId === null;
    return true;
  });

  const ouvertes = filtrees.filter((t) => t.status !== 'done');
  const terminees = filtrees.filter((t) => t.status === 'done');

  // KPI sur mes tâches : c'est ce que je dois faire qui compte, pas le volume de l'équipe.
  const miennes = toutes.filter((t) => t.assigneeUserId === moi);
  const mesOuvertes = miennes.filter((t) => t.status !== 'done').length;
  const mesRetards = miennes.filter((t) => enRetard(t)).length;
  const ilYAUneSemaine = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const mesTermineesRecentes = miennes.filter((t) => t.status === 'done' && (t.doneAt ?? '') >= ilYAUneSemaine).length;

  const rendre = (liste: Task[]) => (
    <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {liste.map((t) => (
        <TaskRow key={t.id} task={t} membres={membres} moi={moi} retard={enRetard(t)} />
      ))}
    </ul>
  );

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Tâches</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl">
            Ce qui reste à faire, pour vous et pour l’équipe. Attribuez une tâche à quelqu’un : la personne est prévenue dans
            ses notifications.
          </p>
        </div>
        <NewTaskForm membres={membres} moi={moi} />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={CircleDot} label="Mes tâches en cours" value={mesOuvertes} accent="orange" hint="à faire ou en cours" />
        <KpiCard
          icon={TriangleAlert}
          label="En retard"
          value={mesRetards}
          accent={mesRetards > 0 ? 'rose' : 'emerald'}
          hint="échéance dépassée"
        />
        <KpiCard icon={CheckCircle2} label="Terminées (7 j)" value={mesTermineesRecentes} accent="emerald" hint="par moi" />
      </div>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Filtrer les tâches">
        {VUES.map((v) => {
          const actif = v.key === vue;
          const compte = toutes.filter((t) => {
            if (t.status === 'done') return false;
            if (v.key === 'mes') return t.assigneeUserId === moi;
            if (v.key === 'equipe') return t.createdByUserId === moi && t.assigneeUserId !== moi;
            if (v.key === 'libres') return t.assigneeUserId === null;
            return true;
          }).length;
          return (
            <Link
              key={v.key}
              href={v.key === 'mes' ? '/taches' : `/taches?vue=${v.key}`}
              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 h-9 rounded-lg border transition ${
                actif
                  ? 'border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800/60'
              }`}
            >
              {v.label}
              <span className="tabular-nums opacity-70">{compte}</span>
            </Link>
          );
        })}
      </nav>

      {ouvertes.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={ListChecks}
            title={vue === 'mes' ? 'Aucune tâche pour vous' : 'Aucune tâche ouverte'}
            description="Créez une tâche et attribuez-la à vous-même ou à un membre de l’équipe."
          />
        </div>
      ) : (
        rendre(ouvertes)
      )}

      {terminees.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
            Terminées ({terminees.length})
          </h2>
          {rendre(terminees.slice(0, 20))}
        </section>
      )}
    </div>
  );
}
