// ARCHETYPE: command
// Justification: planning calendaire des sessions réelles — vue semaine dense, events colorés par statut.

import { AgendaNowLine } from '../agenda/agenda-now-line.client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Filter, CalendarDays, PlayCircle, CalendarClock, UsersRound } from 'lucide-react';
import { KpiCard } from '@/shared/ui/kpi-card';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { AgendaTabs } from '../agenda/agenda-tabs.client';

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const ROW_H = 64; // px par heure (h-16)
const DAY_LABELS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

type SessionStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';

const toneByStatus: Record<SessionStatus, string> = {
  planned: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200/70 dark:border-orange-900/50 border-l-orange-500 text-orange-900 dark:text-orange-200',
  in_progress: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/50 border-l-emerald-500 text-emerald-900 dark:text-emerald-200',
  done: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/70 dark:border-blue-900/50 border-l-blue-400 text-blue-900 dark:text-blue-200',
  cancelled: 'bg-red-50 dark:bg-red-950/40 border-red-200/70 dark:border-red-900/50 border-l-red-500 text-red-900 dark:text-red-200 line-through',
};

const legend = [
  { label: 'En cours', dot: 'bg-emerald-500' },
  { label: 'Planifiée', dot: 'bg-orange-500' },
  { label: 'Terminée', dot: 'bg-blue-400' },
  { label: 'Annulée', dot: 'bg-red-500' },
];

type SessionRow = {
  id: string;
  title: string | null;
  status: SessionStatus;
  starts_at: string;
  ends_at: string;
  dossier_id: string | null;
};

function mondayOf(d: Date): Date {
  const m = new Date(d);
  const day = m.getDay(); // 0 = dimanche
  m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day));
  m.setHours(0, 0, 0, 0);
  return m;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const weekOffset = Number.parseInt(searchParams?.week ?? '0', 10) || 0;

  const weekStart = mondayOf(new Date());
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const sb = supabaseServer();
  // Requête volontairement SANS embed : un embed PostgREST qui échoue (relation,
  // cache de schéma) viderait toute la vue en silence. Champs scalaires seulement.
  const { data, error: sessionErr } = await sb
    .schema('app')
    .from('sessions')
    .select('id, title, status, starts_at, ends_at, dossier_id')
    .gte('starts_at', weekStart.toISOString())
    .lt('starts_at', weekEnd.toISOString())
    .order('starts_at', { ascending: true });

  if (sessionErr) console.error('[planning] échec requête sessions:', sessionErr);
  const sessions = ((data as unknown) as SessionRow[]) ?? [];

  const days = DAY_LABELS.map((label, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { label, dayNum: date.getDate(), isToday: date.toDateString() === new Date().toDateString() };
  });

  const gridHeight = HOURS.length * ROW_H;
  const firstHour = HOURS[0] ?? 8;

  const events = sessions
    .map((s) => {
      const start = new Date(s.starts_at);
      const end = new Date(s.ends_at);
      const dayIdx = (start.getDay() + 6) % 7; // lundi = 0
      const startHour = start.getHours() + start.getMinutes() / 60;
      const durationH = Math.max(0.5, (end.getTime() - start.getTime()) / 3_600_000);
      return {
        id: s.id,
        dayIdx,
        startHour,
        durationH,
        title: s.title || 'Session',
        isGroup: !s.dossier_id,
        status: s.status,
        dossierId: s.dossier_id,
        timeLabel: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      };
    })
    .filter((e) => e.dayIdx >= 0 && e.dayIdx <= 6);

  const monthLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <AgendaTabs />
      <header className="flex items-end justify-between mb-7 gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Planification</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Planning des sessions</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
            {sessions.length} session{sessions.length > 1 ? 's' : ''} cette semaine.
          </p>
          {sessionErr && (
            <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1">
              Impossible de charger les sessions (erreur base de données) — réessayez dans un instant.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sessions"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3.5 h-10 rounded-lg shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition inline-flex items-center gap-2"
          >
            <Filter className="w-4 h-4 text-zinc-400" />
            Toutes les sessions
          </Link>
          <Link
            href="/sessions/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle session
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-label="Synthèse de la semaine">
        <KpiCard label="Sessions de la semaine" value={sessions.length} icon={CalendarDays} accent="blue" />
        <KpiCard label="En cours" value={sessions.filter((s) => s.status === 'in_progress').length} icon={PlayCircle} accent="emerald" />
        <KpiCard label="Planifiées" value={sessions.filter((s) => s.status === 'planned').length} icon={CalendarClock} accent="orange" />
        <KpiCard label="Sessions de groupe" value={sessions.filter((s) => !s.dossier_id).length} icon={UsersRound} accent="rose" />
      </section>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link
              href={`/planning?week=${weekOffset - 1}`}
              aria-label="Semaine précédente"
              className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 capitalize tabular-nums">{monthLabel}</p>
            <Link
              href={`/planning?week=${weekOffset + 1}`}
              aria-label="Semaine suivante"
              className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {weekOffset !== 0 && (
            <Link
              href="/planning"
              className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition"
            >
              Cette semaine
            </Link>
          )}
        </div>

        {/* En-tête des jours */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          <div className="border-r border-zinc-200/70 dark:border-zinc-800" />
          {days.map((d) => (
            <div
              key={d.label}
              className={`px-3 py-3 border-r last:border-r-0 border-zinc-200/70 dark:border-zinc-800 ${
                d.isToday && weekOffset === 0 ? 'bg-orange-50 dark:bg-orange-950/30' : ''
              }`}
            >
              <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400">{d.label}</p>
              <p
                className={`text-[17px] font-extrabold mt-0.5 tabular-nums ${
                  d.isToday && weekOffset === 0 ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {d.dayNum}
              </p>
            </div>
          ))}
        </div>

        <div className="relative">
          <AgendaNowLine startHour={firstHour} endHour={firstHour + HOURS.length} rowH={ROW_H} gutter={60} show={weekOffset === 0} />
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="h-16 border-b border-r border-zinc-100 dark:border-zinc-800/60 px-2 py-1">
                  <p className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{String(h).padStart(2, '0')}:00</p>
                </div>
                {days.map((_, dayIdx) => (
                  <div
                    key={`${h}-${dayIdx}`}
                    className="h-16 border-b border-r last:border-r-0 border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition"
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Events overlay */}
          <div className="absolute inset-0 grid grid-cols-[60px_repeat(7,1fr)] pointer-events-none">
            <div />
            {days.map((_, dayIdx) => (
              <div key={dayIdx} className="relative border-r last:border-r-0 border-transparent">
                {events
                  .filter((e) => e.dayIdx === dayIdx)
                  .map((e) => {
                    const rawTop = (e.startHour - firstHour) * ROW_H;
                    const top = Math.max(0, Math.min(rawTop, gridHeight - 24));
                    const rawHeight = e.durationH * ROW_H - 4;
                    const height = Math.max(24, Math.min(rawHeight, gridHeight - top - 2));
                    const href = e.dossierId ? `/dossiers/${e.dossierId}` : '/sessions';
                    return (
                      <Link
                        key={e.id}
                        href={href}
                        className={`absolute left-1.5 right-1.5 rounded-md border border-l-4 px-2.5 py-1.5 pointer-events-auto cursor-pointer hover:shadow-md transition block overflow-hidden ${toneByStatus[e.status]}`}
                        style={{ top, height }}
                      >
                        <p className="text-[12px] font-bold leading-tight truncate">{e.title}</p>
                        <p className="text-[11px] opacity-80 truncate mt-0.5 tabular-nums">
                          {e.timeLabel}{e.isGroup ? ' · groupe' : ''}
                        </p>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        {/* Légende */}
        <div className="px-5 py-3 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center gap-5 flex-wrap">
          {legend.map((l) => (
            <div key={l.label} className="inline-flex items-center gap-2 text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
              <span className={`w-2.5 h-2.5 rounded-[3px] ${l.dot}`} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
