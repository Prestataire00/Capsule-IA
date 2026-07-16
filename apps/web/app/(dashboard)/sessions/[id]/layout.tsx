// ARCHETYPE: command (sous-shell d'une session)
// Justification: hero + onglets d'une session (le hub par jour de formation), RLS-scopé.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Clock, Users as UsersIcon, ClipboardCheck, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';
import { SessionTabsNav } from './session-tabs-nav';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'success' },
  done: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};
const modalityLabel: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, formation, learners, sheets } = loaded;

  const st = STATUS[session.status] ?? { label: session.status, tone: 'neutral' as const };
  const signed = sheets.reduce((a, s) => a + s.signed, 0);
  const totalSig = sheets.reduce((a, s) => a + s.total, 0);

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-8">
        <Link
          href={formation ? `/formations/${formation.id}` : '/sessions'}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {formation ? formation.title : 'Toutes les sessions'}
        </Link>

        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                {session.title || dayFmt.format(new Date(session.starts_at))}
              </h1>
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </div>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300 capitalize">
              {dayFmt.format(new Date(session.starts_at))} · {timeFmt.format(new Date(session.starts_at))} – {timeFmt.format(new Date(session.ends_at))}
            </p>
            {formation && (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                <Link href={`/formations/${formation.id}`} className="hover:text-violet-600">
                  {formation.code ? `${formation.code} — ` : ''}
                  {formation.title}
                </Link>
              </p>
            )}
          </div>
          {session.remote_url && (
            <a
              href={session.remote_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
            >
              <Video className="w-4 h-4" /> Visio
            </a>
          )}
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MiniStat icon={CalendarClock} label="Modalité" value={`${modalityLabel[session.modality] ?? session.modality}${session.location ? ` · ${session.location}` : ''}`} />
          <MiniStat icon={Clock} label="Durée" value={`${Number(session.duration_hours ?? 0)} h`} />
          <MiniStat icon={UsersIcon} label="Apprenants" value={String(learners.length)} />
          <MiniStat icon={ClipboardCheck} label="Émargements" value={`${sheets.length} feuille${sheets.length > 1 ? 's' : ''}${totalSig ? ` · ${signed}/${totalSig} signés` : ''}`} />
        </section>

        <SessionTabsNav baseHref={`/sessions/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
