// ARCHETYPE: command (sous-shell d'une session)
// Justification: hero + onglets d'une session (le hub par jour de formation), RLS-scopé.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarClock, Clock, Users as UsersIcon, ClipboardCheck, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';
import { formationColorMap, deepColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
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

  // Couleur d'identité de la formation : attribuée dans l'ordre de création de tout le catalogue.
  let color = NEUTRAL_COLOR;
  if (formation) {
    const { data: formationRows } = await sb.schema('app').from('formations').select('id, created_at').is('deleted_at', null);
    color = formationColorMap((formationRows as { id: string; created_at: string | null }[] | null) ?? []).get(formation.id) ?? NEUTRAL_COLOR;
  }

  const st = STATUS[session.status] ?? { label: session.status, tone: 'neutral' as const };
  const signed = sheets.reduce((a, s) => a + s.signed, 0);
  const totalSig = sheets.reduce((a, s) => a + s.total, 0);

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-9">
        <Link
          href={formation ? `/formations/${formation.id}` : '/sessions'}
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {formation ? formation.title : 'Toutes les sessions'}
        </Link>

        <header className="flex items-start justify-between gap-4 mb-7 flex-wrap">
          <div className="min-w-0">
            <SectionLabel className="mb-2">Session</SectionLabel>
            {formation && (
              <p className="flex items-center gap-2 mb-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />
                <Link
                  href={`/formations/${formation.id}`}
                  className="truncate text-[15px] font-extrabold hover:underline"
                  style={{ color: deepColor(color) }}
                >
                  {formation.title}
                </Link>
                {formation.code && (
                  <span className="font-mono text-[12px] text-zinc-500 dark:text-zinc-400 shrink-0">{formation.code}</span>
                )}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[30px] leading-none font-extrabold text-[color:var(--sess)] first-letter:uppercase">
                {session.title || dayFmt.format(new Date(session.starts_at))}
              </h1>
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </div>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums first-letter:uppercase">
              {dayFmt.format(new Date(session.starts_at))} · {timeFmt.format(new Date(session.starts_at))} – {timeFmt.format(new Date(session.ends_at))}
            </p>
          </div>
          {session.remote_url && (
            <a
              href={session.remote_url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 dark:hover:bg-orange-950/70 transition shrink-0"
            >
              <Video className="w-4 h-4" /> Visio <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" aria-label="Chiffres clés de la session">
          <Tile icon={CalendarClock} label="Modalité">
            <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {modalityLabel[session.modality] ?? session.modality}
            </span>
            {session.location && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2">{session.location}</p>}
          </Tile>
          <Tile icon={Clock} label="Durée">
            <Figure>{`${Number(session.duration_hours ?? 0)} h`}</Figure>
          </Tile>
          <Tile icon={UsersIcon} label="Apprenants">
            <Figure>{learners.length}</Figure>
          </Tile>
          <Tile icon={ClipboardCheck} label="Émargements">
            <Figure>{sheets.length}</Figure>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1.5 tabular-nums">
              feuille{sheets.length > 1 ? 's' : ''}
              {totalSig ? ` · ${signed}/${totalSig} signés` : ''}
            </p>
          </Tile>
        </section>

        <SessionTabsNav baseHref={`/sessions/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 min-w-0">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
        <Icon className="w-4 h-4 text-zinc-400" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{children}</p>;
}
