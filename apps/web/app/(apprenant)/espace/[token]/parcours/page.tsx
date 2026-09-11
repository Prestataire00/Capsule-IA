// ARCHETYPE: command
// Justification: parcours guidé de l'apprenant — modules en accordéon + progression dérivée.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Route, BookOpen, PenLine, Check, Download, ClipboardList, Video } from 'lucide-react';
import { AccordionSection } from '@/shared/ui/accordion-section';
import { resolveApprenantContext } from '../_lib';
import { resolveApprenantResources, loadConsultedResourceIds } from '../resources';
import { resolveApprenantExercises } from '../exercises';
import { listApprenantQuestionnaires } from '../questionnaires';
import { buildParcours } from '@/features/apprenant/parcours';

export const dynamic = 'force-dynamic';

const EX_STATUS: Record<string, { label: string; cls: string }> = {
  todo: { label: 'À faire', cls: 'text-amber-600 dark:text-amber-400' },
  submitted: { label: 'Rendu', cls: 'text-blue-600 dark:text-blue-400' },
  graded: { label: 'Corrigé', cls: 'text-emerald-600 dark:text-emerald-400' },
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-orange-500 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export default async function ParcoursPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const [resources, exercises, questionnaires, consulted] = await Promise.all([
    resolveApprenantResources(params.token),
    resolveApprenantExercises(params.token),
    listApprenantQuestionnaires(params.token),
    loadConsultedResourceIds(params.token),
  ]);

  const parcours = buildParcours({
    modules: ctx.modules.map((m) => ({ id: m.id, title: m.title, position: m.position })),
    supports: (resources?.supports ?? []).map((s) => ({
      moduleId: s.moduleId,
      resources: s.resources.map((r) => ({ id: r.id, title: r.title })),
    })),
    exercises: exercises.map((e) => ({
      id: e.id,
      title: e.title,
      moduleId: e.moduleId,
      submission: e.submission ? { status: e.submission.status } : null,
    })),
    questionnaires: questionnaires.map((q) => ({ status: q.status })),
    sessions: ctx.sessions.map((s) => ({ status: s.status })),
    consultedResourceIds: consulted,
  });

  const heuresSignees = resources?.assiduite.heuresSignees ?? 0;
  const completedModules = parcours.modules.filter((m) => m.completed).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* En-tête : progression globale */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Route className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <div>
            <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">Mon parcours</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {ctx.formation?.title ?? 'Votre formation'}
            </p>
          </div>
          <span className="ml-auto text-right">
            <span className="block text-[26px] font-extrabold text-orange-600 dark:text-orange-400 leading-none tabular-nums">
              {parcours.overall.pct}%
            </span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
              {parcours.overall.done}/{parcours.overall.total} activités
            </span>
          </span>
        </div>
        <ProgressBar pct={parcours.overall.pct} />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {completedModules}/{parcours.modules.length} module{parcours.modules.length > 1 ? 's' : ''} terminé
          {completedModules > 1 ? 's' : ''} · {heuresSignees} h émargées
        </p>
      </section>

      {/* Modules en accordéon */}
      {parcours.modules.length === 0 ? (
        <p className="text-[13px] text-zinc-500 text-center py-8">
          Le programme de votre formation sera bientôt disponible.
        </p>
      ) : (
        <div className="space-y-3">
          {parcours.modules.map((m, i) => (
            <AccordionSection
              key={m.id}
              defaultOpen={i === 0}
              icon={m.completed ? <Check className="w-4 h-4 text-emerald-500" /> : <BookOpen className="w-4 h-4" />}
              title={`Module ${m.position} · ${m.title}`}
              description={
                m.pct === null
                  ? 'Ressources à venir'
                  : `${m.doneItems}/${m.totalItems} activité${m.totalItems > 1 ? 's' : ''} · ${m.pct}%`
              }
            >
              {m.pct !== null && <ProgressBar pct={m.pct} />}

              {m.resources.length > 0 && (
                <div className="space-y-1.5">
                  {m.resources.map((r) => (
                    <a
                      key={r.id}
                      href={`/api/espace/${params.token}/resource/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400"
                    >
                      {r.consulted ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="truncate">{r.title}</span>
                      {r.consulted && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">consulté</span>}
                    </a>
                  ))}
                </div>
              )}

              {m.exercises.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {m.exercises.map((e) => (
                    <Link
                      key={e.id}
                      href={`/espace/${params.token}/exercices`}
                      className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400"
                    >
                      <PenLine className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{e.title}</span>
                      <span className={`ml-auto text-[12px] font-semibold ${EX_STATUS[e.status]!.cls}`}>
                        {EX_STATUS[e.status]!.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {m.resources.length === 0 && m.exercises.length === 0 && (
                <p className="text-[12px] text-zinc-400">Aucun contenu pour ce module pour l'instant.</p>
              )}
            </AccordionSection>
          ))}
        </div>
      )}

      {/* Activités du dossier (hors modules) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href={`/espace/${params.token}/questionnaires`}
          className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 py-3 hover:border-orange-300 dark:hover:border-orange-800 transition"
        >
          <ClipboardList className="w-4 h-4 text-zinc-400" />
          <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1">Questionnaires</span>
          <span className="text-[12px] font-semibold text-zinc-500 tabular-nums">
            {questionnaires.filter((q) => q.status === 'completed').length}/{questionnaires.length}
          </span>
        </Link>
        <Link
          href={`/espace/${params.token}/sessions`}
          className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 py-3 hover:border-orange-300 dark:hover:border-orange-800 transition"
        >
          <Video className="w-4 h-4 text-zinc-400" />
          <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1">Sessions & replays</span>
          <span className="text-[12px] font-semibold text-zinc-500 tabular-nums">
            {ctx.sessions.filter((s) => s.status === 'done').length}/{ctx.sessions.length}
          </span>
        </Link>
      </div>
    </div>
  );
}
