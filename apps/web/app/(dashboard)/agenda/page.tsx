// ARCHETYPE: command
// Justification: vue calendaire hebdomadaire de l'agenda Google synchronisé de l'utilisateur (couleurs Google conservées).

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { CalendarDays, ChevronLeft, ChevronRight, Plug, Video } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';
import { listAgenda, type CalEvent } from '@/shared/lib/integrations/google-calendar-client';
import { AgendaTabs } from './agenda-tabs.client';
import { AgendaNowLine } from './agenda-now-line.client';
import { ACCENTS } from '@/shared/ui/kpi-card';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const ROW_H = 52; // px par heure
const DAY_LABELS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const DEFAULT_BG = '#e8eaed';
const DEFAULT_FG = '#3c4043';

function admin() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** {key: 'YYYY-MM-DD', hour, minute} d'un instant ISO, exprimé en Europe/Paris. */
function parisParts(iso: string): { key: string; hour: number; minute: number } {
  const parts = partsFmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? 0 : Number(get('hour'));
  return { key: `${get('year')}-${get('month')}-${get('day')}`, hour, minute: Number(get('minute')) };
}

/** Heure « HH:MM » (Europe/Paris) d'un instant ISO. */
function hm(iso: string): string {
  const p = parisParts(iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const FULL_DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

type Timed = CalEvent & { startHour: number; durationH: number; timeLabel: string };
type Positioned = Timed & { lane: number; lanes: number };

/** Assigne des « lanes » côte-à-côte aux évènements qui se chevauchent dans une journée. */
function packLanes(evts: Timed[]): Positioned[] {
  const sorted = [...evts].sort((a, b) => a.startHour - b.startHour || b.durationH - a.durationH);
  const laneEnds: number[] = [];
  const withLane = sorted.map((e) => {
    let lane = laneEnds.findIndex((end) => end <= e.startHour + 1e-6);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.startHour + e.durationH);
    } else {
      laneEnds[lane] = e.startHour + e.durationH;
    }
    return { ...e, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return withLane.map((e) => ({ ...e, lanes }));
}

/** Une ligne d'événement dans la vue Liste (heure + titre + lieu + Meet). */
function AgendaListRow({ e, timeText }: { e: CalEvent; timeText: string }) {
  const inner = (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: e.bgColor ?? DEFAULT_BG }} />
      <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 w-[92px] flex-shrink-0 tabular-nums">
        {timeText}
      </span>
      <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate flex-1">{e.title || '(sans titre)'}</span>
      {e.location && (
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate hidden sm:inline max-w-[200px]">
          {e.location}
        </span>
      )}
      {e.hangoutLink && (
        <span className={`h-6 w-6 rounded-md grid place-items-center flex-shrink-0 ${ACCENTS.blue.soft}`} title="Visio">
          <Video className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
  return e.htmlLink ? (
    <li>
      <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    </li>
  ) : (
    <li>{inner}</li>
  );
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams?: { week?: string; view?: string };
}) {
  const weekOffset = Number.parseInt(searchParams?.week ?? '0', 10) || 0;
  const view: 'liste' | 'semaine' = searchParams?.view === 'liste' ? 'liste' : 'semaine';

  const { data: auth } = await supabaseServer().auth.getUser();
  const userId = auth?.user?.id ?? null;

  const sb = admin();
  const [creds, integRow] = await Promise.all([
    userId ? loadGoogleCredsForUser(sb, userId) : Promise.resolve(null),
    userId
      ? sb.schema('app').from('user_integrations').select('account_email').eq('user_id', userId).eq('kind', 'google_calendar').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const accountEmail = (integRow?.data as { account_email: string | null } | null)?.account_email ?? null;

  const header = (
    <div>
      <SectionLabel className="mb-2">Mon espace</SectionLabel>
      <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Agenda</h1>
      <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
        {accountEmail ? `Synchronisé avec votre Google Agenda — ${accountEmail}` : 'Vos événements Google Agenda, synchronisés dans Capsule IA.'}
      </p>
    </div>
  );

  if (!creds) {
    return (
      <div className="max-w-7xl w-full mx-auto px-8 py-8 space-y-6">
        <AgendaTabs />
        {header}
        <div className="border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-6 py-10 text-center bg-white dark:bg-zinc-900">
          <span className={`w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-3 ${ACCENTS.blue.soft}`}>
            <CalendarDays className="w-7 h-7" />
          </span>
          <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Aucun agenda connecté</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            Connectez votre compte Google pour voir vos événements ici et créer automatiquement les liens Meet de vos sessions.
          </p>
          <Link
            href="/parametres/integrations/google-calendar"
            className="mt-5 inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
          >
            <Plug className="w-4 h-4" /> Connecter Google Agenda
          </Link>
        </div>
      </div>
    );
  }

  // Semaine (lundi→dimanche), ancrée à midi UTC pour éviter les décalages de fuseau.
  const [ty, tm, td] = dayKeyFmt.format(new Date()).split('-').map(Number);
  const monday = new Date(Date.UTC(ty!, (tm ?? 1) - 1, td ?? 1, 12));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + weekOffset * 7);
  const todayKey = dayKeyFmt.format(new Date());

  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return { label, key, dayNum: d.getUTCDate(), isToday: key === todayKey };
  });
  const weekKeys = new Set(days.map((d) => d.key));

  // Fenêtre de requête élargie de ±1 jour (filtrage précis ensuite par jour Paris).
  const from = new Date(monday);
  from.setUTCDate(monday.getUTCDate() - 1);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(monday);
  to.setUTCDate(monday.getUTCDate() + 8);
  to.setUTCHours(0, 0, 0, 0);

  const result = await listAgenda(creds, { timeMin: from.toISOString(), timeMax: to.toISOString() });

  const monthLabel = `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCFullYear()}`;
  const nav = (
    <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <Link href={`/agenda?week=${weekOffset - 1}`} aria-label="Semaine précédente" className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 capitalize tabular-nums">{monthLabel}</p>
        <Link href={`/agenda?week=${weekOffset + 1}`} aria-label="Semaine suivante" className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center">
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      {weekOffset !== 0 && (
        <Link href="/agenda" className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition">
          Cette semaine
        </Link>
      )}
    </div>
  );

  if (!result.ok) {
    return (
      <div className="max-w-7xl w-full mx-auto px-8 py-8 space-y-6">
        <AgendaTabs />
        {header}
        <div className="border border-amber-200/70 dark:border-amber-900/50 rounded-xl px-6 py-8 text-center bg-amber-50/60 dark:bg-amber-950/30">
          <p className="text-[14px] font-bold text-amber-800 dark:text-amber-200">Agenda momentanément indisponible</p>
          <p className="text-[13px] text-amber-700/80 dark:text-amber-300/70 mt-1">Impossible de récupérer vos événements. L'accès a peut-être été révoqué côté Google.</p>
          <Link href="/parametres/integrations/google-calendar" className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-amber-800 dark:text-amber-200 hover:underline">
            <Plug className="w-4 h-4" /> Reconnecter
          </Link>
        </div>
      </div>
    );
  }

  // Répartition all-day / horaires, filtrés sur la semaine affichée.
  const allDayByDay = new Map<string, CalEvent[]>();
  const timedByDay = new Map<string, Timed[]>();

  for (const e of result.value) {
    if (e.allDay) {
      const key = e.start.slice(0, 10);
      if (!weekKeys.has(key)) continue;
      const arr = allDayByDay.get(key) ?? [];
      arr.push(e);
      allDayByDay.set(key, arr);
    } else {
      const p = parisParts(e.start);
      if (!weekKeys.has(p.key)) continue;
      const startHour = p.hour + p.minute / 60;
      const durationH = e.end ? Math.max(0.25, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3_600_000) : 1;
      const arr = timedByDay.get(p.key) ?? [];
      arr.push({ ...e, startHour, durationH, timeLabel: `${pad(p.hour)}:${pad(p.minute)}` });
      timedByDay.set(p.key, arr);
    }
  }

  const positionedByDay = new Map<string, Positioned[]>();
  for (const [key, evts] of timedByDay) positionedByDay.set(key, packLanes(evts));

  const gridHeight = HOURS.length * ROW_H;
  let eventCount = 0;
  allDayByDay.forEach((v) => (eventCount += v.length));
  timedByDay.forEach((v) => (eventCount += v.length));

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8 space-y-6">
        <AgendaTabs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        {header}
        <div className="flex items-center gap-3">
          <p className={`text-[12px] font-bold tabular-nums px-2.5 py-1 rounded-full ${ACCENTS.blue.soft}`}>
            {eventCount} événement{eventCount > 1 ? 's' : ''} cette semaine
          </p>
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70">
            {(['liste', 'semaine'] as const).map((v) => (
              <Link
                key={v}
                href={`/agenda?week=${weekOffset}&view=${v}`}
                aria-current={view === v ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-md text-[12px] capitalize transition ${
                  view === v
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === 'liste' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          {nav}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {days.map((d, i) => {
              const allDay = allDayByDay.get(d.key) ?? [];
              const timed = [...(timedByDay.get(d.key) ?? [])].sort((a, b) => a.startHour - b.startHour);
              const total = allDay.length + timed.length;
              return (
                <div
                  key={d.key}
                  className={`px-4 sm:px-5 py-3.5 ${d.isToday ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''}`}
                >
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span
                      className={`text-[13px] font-bold tabular-nums ${
                        d.isToday ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {FULL_DAY_LABELS[i]} {d.dayNum}
                    </span>
                    {total > 0 && (
                      <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full ${d.isToday ? ACCENTS.orange.soft : ACCENTS.blue.soft}`}>
                        {total} évt
                      </span>
                    )}
                  </div>
                  {total === 0 ? (
                    <p className="text-[12px] text-zinc-400 dark:text-zinc-500 pl-1">Rien de prévu</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {allDay.map((e) => (
                        <AgendaListRow key={e.id} e={e} timeText="Journée" />
                      ))}
                      {timed.map((e) => (
                        <AgendaListRow
                          key={e.id}
                          e={e}
                          timeText={e.end ? `${e.timeLabel}–${hm(e.end)}` : e.timeLabel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'semaine' && (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        {nav}

        {/* En-tête des jours */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          <div className="border-r border-zinc-200/70 dark:border-zinc-800" />
          {days.map((d) => (
            <div key={d.key} className={`px-2 py-2 border-r last:border-r-0 border-zinc-200/70 dark:border-zinc-800 ${d.isToday ? 'bg-orange-50 dark:bg-orange-950/30' : ''}`}>
              <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400">{d.label}</p>
              <p className={`text-[17px] font-extrabold mt-0.5 tabular-nums ${d.isToday ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{d.dayNum}</p>
            </div>
          ))}
        </div>

        {/* Bandeau journée entière */}
        {days.some((d) => (allDayByDay.get(d.key)?.length ?? 0) > 0) && (
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30">
            <div className="border-r border-zinc-200/70 dark:border-zinc-800 flex items-center justify-center">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">jour</span>
            </div>
            {days.map((d) => (
              <div key={d.key} className="p-1 border-r last:border-r-0 border-zinc-200/70 dark:border-zinc-800 space-y-1 min-h-[28px]">
                {(allDayByDay.get(d.key) ?? []).map((e) => (
                  <div
                    key={e.id}
                    className="text-[11px] leading-tight rounded px-1.5 py-0.5 truncate"
                    style={{ backgroundColor: e.bgColor ?? DEFAULT_BG, color: e.fgColor ?? DEFAULT_FG }}
                    title={e.title}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Grille horaire */}
        <div className="relative">
          <AgendaNowLine startHour={START_HOUR} endHour={END_HOUR} rowH={ROW_H} show={weekKeys.has(todayKey)} />
          <div className="grid grid-cols-[52px_repeat(7,1fr)]">
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="border-b border-r border-zinc-100 dark:border-zinc-800/60 px-1.5 py-1" style={{ height: ROW_H }}>
                  <p className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{pad(h)}:00</p>
                </div>
                {days.map((d) => (
                  <div
                    key={`${h}-${d.key}`}
                    className={`border-b border-r last:border-r-0 border-zinc-100 dark:border-zinc-800/60 ${d.isToday ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''}`}
                    style={{ height: ROW_H }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Overlay évènements */}
          <div className="absolute inset-0 grid grid-cols-[52px_repeat(7,1fr)] pointer-events-none">
            <div />
            {days.map((d) => (
              <div key={d.key} className="relative">
                {(positionedByDay.get(d.key) ?? []).map((e) => {
                  const rawTop = (e.startHour - START_HOUR) * ROW_H;
                  const top = Math.max(0, Math.min(rawTop, gridHeight - 20));
                  const height = Math.max(20, Math.min(e.durationH * ROW_H - 2, gridHeight - top - 1));
                  const widthPct = 100 / e.lanes;
                  const leftPct = e.lane * widthPct;
                  const content = (
                    <>
                      <p className="text-[11px] font-bold leading-tight truncate">{e.title}</p>
                      {height > 30 && (
                        <p className="text-[11px] opacity-80 truncate leading-tight inline-flex items-center gap-1 tabular-nums">
                          {e.hangoutLink && <Video className="w-2.5 h-2.5" />}
                          {e.timeLabel}
                        </p>
                      )}
                    </>
                  );
                  const style = {
                    top,
                    height,
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    backgroundColor: e.bgColor ?? DEFAULT_BG,
                    color: e.fgColor ?? DEFAULT_FG,
                  };
                  return e.htmlLink ? (
                    <a
                      key={e.id}
                      href={e.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute rounded-md px-1.5 py-0.5 overflow-hidden pointer-events-auto hover:shadow-md hover:brightness-95 transition block"
                      style={style}
                      title={`${e.timeLabel} · ${e.title}`}
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={e.id} className="absolute rounded-md px-1.5 py-0.5 overflow-hidden" style={style} title={`${e.timeLabel} · ${e.title}`}>
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {eventCount === 0 && (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 text-center">
          Aucun événement cette semaine. Si votre agenda en contient, déconnectez puis reconnectez Google Agenda pour autoriser la lecture de tous vos agendas.
        </p>
      )}
    </div>
  );
}
