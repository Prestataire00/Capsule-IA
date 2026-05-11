// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { PenLine, CheckCircle2, CircleDashed, Award } from 'lucide-react';
import { resolveApprenantContext, MOCK_EXERCISES } from '../_lib';

export const dynamic = 'force-dynamic';

export default async function EspaceExercicesPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const submitted = MOCK_EXERCISES.filter((e) => e.status === 'submitted').length;
  const total = MOCK_EXERCISES.length;

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/60 dark:to-amber-950/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
          <PenLine className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Exercices & devoirs</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {submitted}/{total} rendu{submitted > 1 ? 's' : ''} sur l'ensemble du parcours.
          </p>
        </div>
      </header>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-3">
          {MOCK_EXERCISES.map((ex) => {
            const Icon = ex.status === 'submitted' ? CheckCircle2 : ex.status === 'in_progress' ? CircleDashed : Award;
            const tone =
              ex.status === 'submitted'
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : ex.status === 'in_progress'
                ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400';
            const label = ex.status === 'submitted' ? 'Rendu' : ex.status === 'in_progress' ? 'En cours' : 'À faire';
            return (
              <li key={ex.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{ex.title}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {ex.moduleTitle} · à rendre le {new Date(ex.dueDate).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
