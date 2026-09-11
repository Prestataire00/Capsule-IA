// ARCHETYPE: command (sous-shell d'une session)
// Justification: hero + onglets d'une session (le hub par jour de formation), RLS-scopé.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarClock, Clock, Users as UsersIcon, ClipboardCheck, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { KpiCard, AccentBar } from '@/shared/ui/kpi-card';
import { loadSession } from '@/features/sessions/load-session';
import { formationColorMap, deepColor, tintColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
import { SessionTabsNav } from './session-tabs-nav';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const hoursFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

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
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {formation ? formation.title : 'Toutes les sessions'}
        </Link>

        {/* Bandeau teinté à la couleur de la formation, relevé d'une touche d'orange Capsule. */}
        <header
          className="rounded-2xl border px-7 py-6 mb-6 flex items-start justify-between gap-4 flex-wrap"
          style={{
            background: `linear-gradient(135deg, ${tintColor(color, 16)} 0%, ${tintColor('#f97316', 9)} 100%)`,
            borderColor: tintColor(color, 30),
          }}
        >
          <div className="min-w-0">
            <SectionLabel className="mb-2">Session</SectionLabel>
            {formation && (
              <p className="flex items-center gap-2 mb-2.5 min-w-0">
                <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: color }} />
                <Link
                  href={`/formations/${formation.id}`}
                  className="truncate text-[16px] font-extrabold hover:underline"
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
            <p className="text-[14px] font-medium text-zinc-600 dark:text-zinc-300 mt-3 tabular-nums first-letter:uppercase">
              {dayFmt.format(new Date(session.starts_at))} · {timeFmt.format(new Date(session.starts_at))} – {timeFmt.format(new Date(session.ends_at))}
            </p>
          </div>
          {session.remote_url && (
            <a
              href={session.remote_url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-600/30 transition shrink-0"
            >
              <Video className="w-4 h-4" /> Rejoindre la visio <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" aria-label="Chiffres clés de la session">
          <KpiCard icon={CalendarClock} label="Modalité" accent="blue">
            <span className="inline-flex items-center h-7 px-2.5 rounded-lg text-[13px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              {modalityLabel[session.modality] ?? session.modality}
            </span>
            {session.location && <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">{session.location}</p>}
          </KpiCard>
          <KpiCard icon={Clock} label="Durée" value={`${hoursFmt.format(Number(session.duration_hours ?? 0))} h`} accent="orange" />
          <KpiCard
            icon={UsersIcon}
            label="Apprenants"
            value={learners.length}
            hint={learners.length ? `inscrit${learners.length > 1 ? 's' : ''} à la séance` : 'aucun inscrit pour le moment'}
            accent="rose"
          />
          <KpiCard
            icon={ClipboardCheck}
            label="Émargements"
            value={totalSig ? `${signed}/${totalSig}` : sheets.length}
            accent="emerald"
            hint={`${sheets.length} feuille${sheets.length > 1 ? 's' : ''}${totalSig ? ' · signatures' : ''}`}
          >
            {totalSig > 0 && <AccentBar value={signed} max={totalSig} accent="emerald" className="mt-1" />}
          </KpiCard>
        </section>

        <SessionTabsNav baseHref={`/sessions/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
