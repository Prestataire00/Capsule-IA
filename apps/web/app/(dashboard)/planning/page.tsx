// ARCHETYPE: command
// Justification: planning calendaire des sessions réelles — vue semaine dense, events colorés par statut.

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Filter } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
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
  planned: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200/60 dark:border-violet-900/50 text-violet-900 dark:text-violet-200',
  in_progress: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200',
  done: 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300',
  cancelled: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 line-through',
};

const legend = [
  { label: 'En cours', dot: 'bg-emerald-500' },
  { label: 'Planifiée', dot: 'bg-violet-500' },
  { label: 'Terminée', dot: 'bg-zinc-400' },
  { label: 'Annulée', dot: 'bg-rose-500' },
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
    return { label, dayNum: date.getDate() };
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
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <AgendaTabs />
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Planning des sessions</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
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
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
          >
            <Filter className="w-3.5 h-3.5" />
            Toutes les sessions
          </Link>
          <Link
            href="/sessions/nouvelle"
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouvelle session
          </Link>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link
              href={`/planning?week=${weekOffset - 1}`}
              aria-label="Semaine précédente"
              className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 capitalize">{monthLabel}</p>
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
              className="text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition"
            >
              Cette semaine
            </Link>
          )}
        </div>

        {/* En-tête des jours */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-zinc-200/60 dark:border-zinc-800">
          <div className="border-r border-zinc-200/60 dark:border-zinc-800" />
          {days.map((d) => (
            <div key={d.label} className="px-3 py-3 border-r last:border-r-0 border-zinc-200/60 dark:border-zinc-800">
              <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{d.label}</p>
              <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{d.dayNum}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="h-16 border-b border-r border-zinc-100 dark:border-zinc-800/60 px-2 py-1">
                  <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{String(h).padStart(2, '0')}:00</p>
                </div>
                {days.map((_, dayIdx) => (
                  <div
                    key={`${h}-${dayIdx}`}
                    className="h-16 border-b border-r last:border-r-0 border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 transition"
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
                        className={`absolute left-1.5 right-1.5 rounded-md border px-2.5 py-1.5 pointer-events-auto cursor-pointer hover:shadow-md transition block overflow-hidden ${toneByStatus[e.status]}`}
                        style={{ top, height }}
                      >
                        <p className="text-[12px] font-medium leading-tight truncate">{e.title}</p>
                        <p className="text-[11px] opacity-75 truncate mt-0.5">
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
        <div className="px-5 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center gap-5 flex-wrap">
          {legend.map((l) => (
            <div key={l.label} className="inline-flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${l.dot}`} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
