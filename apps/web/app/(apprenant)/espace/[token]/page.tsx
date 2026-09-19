// ARCHETYPE: command
// Justification: home espace apprenant — hero + dossier + tuiles vers les sections.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  GraduationCap,
  Calendar,
  Clock,
  CheckCircle2,
  Video,
  FileText,
  PenLine,
  MessageSquareWarning,
  ChevronRight,
  Sparkles,
  BookOpen,
  ClipboardList,
  Route,
  ArrowRight,
} from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { KpiCard, AccentBar } from '@/shared/ui/kpi-card';
import { resolveApprenantContext, MODALITY_LABEL, formatSessionDate, formatSessionTime } from './_lib';
import { resolveApprenantResources } from './resources';
import { resolveApprenantExercises } from './exercises';
import { listApprenantQuestionnaires } from './questionnaires';

export const dynamic = 'force-dynamic';

export default async function EspaceHomePage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const [resources, exercises, questionnaires] = await Promise.all([
    resolveApprenantResources(params.token),
    resolveApprenantExercises(params.token),
    listApprenantQuestionnaires(params.token),
  ]);

  const questionnairesTodo = questionnaires.filter((q) => q.status !== 'completed' && q.status !== 'expired').length;

  const sessionsDone = ctx.sessions.filter((s) => s.status === 'done').length;
  const sessionsCount = ctx.sessions.length;
  const progress = sessionsCount ? Math.round((sessionsDone / sessionsCount) * 100) : 0;

  const heuresSignees = resources?.assiduite.heuresSignees ?? 0;
  const heuresPlanifiees = resources?.assiduite.heuresPlanifiees ?? 0;
  const docsDispo = resources?.documents.filter((d) => d.displayStatus !== 'pending').length ?? 0;
  const exosTodo = exercises.filter((e) => !e.submission || e.submission.status !== 'graded').length;
  const complaintsOpen = ctx.complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').length;
  // Prochaine séance = première session non terminée (sessions déjà triées par date asc).
  const nextSession = ctx.sessions.find((s) => s.status !== 'done') ?? null;

  const tiles = [
    {
      href: `/espace/${params.token}/sessions`,
      icon: Video,
      label: 'Sessions & replays',
      hint: `${sessionsDone}/${sessionsCount} séance${sessionsCount > 1 ? 's' : ''}`,
      accent: 'violet',
    },
    {
      href: `/espace/${params.token}/documents`,
      icon: FileText,
      label: 'Documents',
      hint: `${docsDispo} document${docsDispo > 1 ? 's' : ''} disponible${docsDispo > 1 ? 's' : ''}`,
      accent: 'blue',
    },
    {
      href: `/espace/${params.token}/exercices`,
      icon: PenLine,
      label: 'Exercices',
      hint: exosTodo === 0 ? 'Tous rendus' : `${exosTodo} à faire`,
      accent: exosTodo === 0 ? 'emerald' : 'amber',
    },
    {
      href: `/espace/${params.token}/questionnaires`,
      icon: ClipboardList,
      label: 'Questionnaires',
      hint: questionnairesTodo === 0 ? 'À jour' : `${questionnairesTodo} à compléter`,
      accent: questionnairesTodo === 0 ? 'emerald' : 'amber',
    },
    {
      href: `/espace/${params.token}/reclamation`,
      icon: MessageSquareWarning,
      label: 'Réclamation',
      hint: complaintsOpen > 0 ? `${complaintsOpen} en cours` : 'Aucune en cours',
      accent: complaintsOpen > 0 ? 'rose' : 'zinc',
    },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Hero */}
      <section className="mb-6 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-rose-950/30 px-6 sm:px-7 py-6 flex items-center gap-5">
        <span className="hidden sm:grid w-14 h-14 rounded-2xl place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 shrink-0">
          <GraduationCap className="w-7 h-7" />
        </span>
        <div className="min-w-0">
          <SectionLabel className="mb-2">Espace apprenant</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
            Bonjour {ctx.learner.firstName}
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3">
            Tout ce dont vous avez besoin pour votre formation, organisé par section.
          </p>
        </div>
      </section>

      {/* Chiffres clés */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          href={`/espace/${params.token}/sessions`}
          label="Sessions"
          value={`${sessionsDone}/${sessionsCount}`}
          hint={`séance${sessionsDone > 1 ? 's' : ''} réalisée${sessionsDone > 1 ? 's' : ''}`}
          icon={Video}
          accent="blue"
        />
        <KpiCard
          href={`/espace/${params.token}/documents`}
          label="Documents"
          value={docsDispo}
          hint={`disponible${docsDispo > 1 ? 's' : ''}`}
          icon={FileText}
          accent="orange"
        />
        <KpiCard
          href={`/espace/${params.token}/questionnaires`}
          label="Questionnaires"
          value={questionnairesTodo}
          hint={questionnairesTodo === 0 ? 'à jour' : 'à compléter'}
          icon={ClipboardList}
          accent="purple"
        />
        <KpiCard href={`/espace/${params.token}/parcours`} label="Progression" value={`${progress} %`} icon={Route} accent="emerald">
          <AccentBar value={progress} max={100} accent="emerald" />
        </KpiCard>
      </section>

      {/* Carte parcours — entrée principale façon SoSafe */}
      <Link
        href={`/espace/${params.token}/parcours`}
        className="group flex items-center gap-4 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/40 dark:to-zinc-900 border border-orange-100 dark:border-orange-900/40 rounded-xl shadow-sm p-5 mb-6 hover:border-orange-300 dark:hover:border-orange-800 hover:shadow-md transition"
      >
        <span className="w-10 h-10 rounded-xl grid place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 flex-shrink-0">
          <Route className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Mon parcours</span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            Suivez votre progression module par module.
          </span>
        </span>
        <ArrowRight className="w-4 h-4 text-orange-400 group-hover:text-orange-600 transition flex-shrink-0" />
      </Link>

      {/* Dossier card */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 flex-shrink-0">
                <GraduationCap className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{ctx.dossier.reference}</p>
                <p className="text-[17px] font-extrabold text-[color:var(--sess)] truncate">{ctx.formation?.title ?? '—'}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    du {new Date(ctx.dossier.startDate).toLocaleDateString('fr-FR')} au {new Date(ctx.dossier.endDate).toLocaleDateString('fr-FR')}
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {ctx.dossier.totalHours} h
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span>{MODALITY_LABEL[ctx.dossier.modality] ?? ctx.dossier.modality}</span>
                </p>
              </div>
            </div>
            <span className="text-[12px] font-semibold h-6 px-2.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/15 inline-flex items-center gap-1.5 flex-shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5" /> En cours
            </span>
          </div>

          {ctx.trainer && (
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <span className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 ring-1 ring-inset ring-purple-200/70 dark:ring-purple-900/50 flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                {ctx.trainer.firstName[0]}
                {ctx.trainer.lastName[0]}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                  Votre formateur : {ctx.trainer.firstName} {ctx.trainer.lastName}
                </p>
                <a href={`mailto:${ctx.trainer.email}`} className="text-[12px] text-orange-600 dark:text-orange-400 hover:underline">
                  {ctx.trainer.email}
                </a>
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[12px] text-zinc-600 dark:text-zinc-400 font-semibold tabular-nums">
                Progression — {sessionsDone}/{sessionsCount} séance{sessionsCount > 1 ? 's' : ''}
              </p>
              <p className="text-[13px] text-emerald-700 dark:text-emerald-300 font-extrabold tabular-nums">{progress} %</p>
            </div>
            <AccentBar value={progress} max={100} accent="emerald" />
          </div>
        </div>
      </section>

      {/* Prochaine séance + lien visio */}
      {nextSession && (
        <section className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-zinc-900 border border-blue-100 dark:border-blue-900/40 rounded-xl shadow-sm p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <span
            className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${
              nextSession.status === 'in_progress'
                ? 'text-white bg-orange-500 shadow-md shadow-orange-500/30 animate-pulse'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            }`}
          >
            <Calendar className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-orange-600 dark:text-orange-400">
              {nextSession.status === 'in_progress' ? 'Séance en cours' : 'Prochaine séance'}
            </p>
            <p className="text-[15px] font-bold text-[color:var(--sess)] capitalize truncate tabular-nums mt-1">
              {formatSessionDate(nextSession.startsAt)}
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
              {formatSessionTime(nextSession.startsAt)} – {formatSessionTime(nextSession.endsAt)}
              {nextSession.location && ` · ${nextSession.location}`}
            </p>
          </div>
          {nextSession.remoteUrl && (
            <a
              href={nextSession.remoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold px-4 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition flex-shrink-0 w-full sm:w-auto"
            >
              <Video className="w-3.5 h-3.5" />
              Rejoindre la visio
            </a>
          )}
        </section>
      )}

      {/* Tuiles raccourcis */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900/60 transition flex items-center gap-4"
            >
              <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${tileSquare(t.accent)}`}>
                <Icon className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{t.label}</p>
                <p className={`text-[12px] mt-0.5 tabular-nums ${hintTone(t.accent)}`}>{t.hint}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-orange-500 transition flex-shrink-0" />
            </Link>
          );
        })}
      </section>

      {/* Carte Assiduité */}
      <section className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-zinc-900 border border-emerald-100 dark:border-emerald-900/40 rounded-xl shadow-sm p-5 mb-8 flex items-center gap-4">
        <span className="w-10 h-10 rounded-xl grid place-items-center text-white bg-emerald-500 shadow-md shadow-emerald-500/30 flex-shrink-0">
          <BookOpen className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Assiduité</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            {heuresSignees.toFixed(1)} h signées / {heuresPlanifiees.toFixed(1)} h planifiées
          </p>
          {heuresPlanifiees > 0 && (
            <AccentBar value={heuresSignees} max={heuresPlanifiees} accent="emerald" className="mt-2 max-w-xs" />
          )}
        </div>
        {heuresPlanifiees > 0 && (
          <p className="text-[24px] leading-none font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums flex-shrink-0">
            {Math.round((heuresSignees / heuresPlanifiees) * 100)} %
          </p>
        )}
      </section>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 inline-flex items-center justify-center gap-1.5 w-full">
        <Sparkles className="w-3 h-3 text-orange-400" />
        Accès sécurisé personnel · données traitées dans le strict respect du RGPD
      </p>
    </div>
  );
}

// Charte v4 « vivante » : pictogramme sur carré de couleur douce + ligne d'état teintée.
function tileSquare(accent: 'violet' | 'blue' | 'amber' | 'emerald' | 'rose' | 'zinc'): string {
  const styles: Record<string, string> = {
    violet: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  };
  return styles[accent] ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
}

function hintTone(accent: 'violet' | 'blue' | 'amber' | 'emerald' | 'rose' | 'zinc'): string {
  const styles: Record<string, string> = {
    amber: 'text-amber-700 dark:text-amber-400 font-semibold',
    emerald: 'text-emerald-700 dark:text-emerald-400',
    rose: 'text-rose-700 dark:text-rose-400 font-semibold',
  };
  return styles[accent] ?? 'text-zinc-500 dark:text-zinc-400';
}
