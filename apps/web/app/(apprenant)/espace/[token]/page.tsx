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
} from 'lucide-react';
import { resolveApprenantContext, MOCK_ADMIN_DOCS, MOCK_EXERCISES, MODALITY_LABEL } from './_lib';

export const dynamic = 'force-dynamic';

export default async function EspaceHomePage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const sessionsDone = ctx.sessions.filter((s) => s.status === 'done').length;
  const sessionsCount = ctx.sessions.length;
  const progress = sessionsCount ? Math.round((sessionsDone / sessionsCount) * 100) : 0;

  const docsAvailable = MOCK_ADMIN_DOCS.filter((d) => d.status !== 'pending').length;
  const exosTodo = MOCK_EXERCISES.filter((e) => e.status !== 'submitted').length;
  const complaintsOpen = ctx.complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').length;

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
      hint: `${docsAvailable} document${docsAvailable > 1 ? 's' : ''} disponible${docsAvailable > 1 ? 's' : ''}`,
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
      href: `/espace/${params.token}/reclamation`,
      icon: MessageSquareWarning,
      label: 'Réclamation',
      hint: complaintsOpen > 0 ? `${complaintsOpen} en cours` : 'Aucune en cours',
      accent: complaintsOpen > 0 ? 'rose' : 'zinc',
    },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {/* Hero */}
      <section className="mb-8">
        <p className="text-[12px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">Espace apprenant</p>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-1">
          Bonjour {ctx.learner.firstName} 👋
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
          Tout ce dont vous avez besoin pour votre formation, organisé par section.
        </p>
      </section>

      {/* Dossier card */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{ctx.dossier.reference}</p>
                <p className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{ctx.formation?.title ?? '—'}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
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
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1 flex-shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5" /> En cours
            </span>
          </div>

          {ctx.trainer && (
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                {ctx.trainer.firstName[0]}
                {ctx.trainer.lastName[0]}
              </span>
              <div>
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  Votre formateur : {ctx.trainer.firstName} {ctx.trainer.lastName}
                </p>
                <a href={`mailto:${ctx.trainer.email}`} className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline">
                  {ctx.trainer.email}
                </a>
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[12px] text-zinc-600 dark:text-zinc-400 font-medium">
                Progression — {sessionsDone}/{sessionsCount} séance{sessionsCount > 1 ? 's' : ''}
              </p>
              <p className="text-[12px] text-zinc-900 dark:text-zinc-100 font-semibold tabular-nums">{progress} %</p>
            </div>
            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tuiles raccourcis */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition flex items-center gap-4"
            >
              <span className={tileAccent(t.accent)}>
                <Icon className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{t.label}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{t.hint}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-violet-600 transition flex-shrink-0" />
            </Link>
          );
        })}
      </section>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 inline-flex items-center justify-center gap-1.5 w-full">
        <Sparkles className="w-3 h-3" />
        Accès sécurisé personnel · données traitées dans le strict respect du RGPD
      </p>
    </div>
  );
}

function tileAccent(accent: 'violet' | 'blue' | 'amber' | 'emerald' | 'rose' | 'zinc'): string {
  const styles: Record<string, string> = {
    violet: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
    blue: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    emerald: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    rose: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
  };
  return `w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${styles[accent]}`;
}
