// ARCHETYPE: command
// Justification: vue transversale de toutes les sessions de l'organisme — une ligne par session, la formation en tête de ligne, RLS-scopé.

import Link from 'next/link';
import type { ComponentType, ReactElement } from 'react';
import { Search, Plus, CalendarClock, Eye, ClipboardCheck, Users, MapPin, Video, ArrowUpRight } from 'lucide-react';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { FilterDropdown } from '@/shared/components/filters/filter-dropdown.client';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { formationColorMap, deepColor, tintColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; formation?: string; quand?: string };

type SessionRow = {
  id: string;
  title: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  modality: string;
  remote_url: string | null;
  dossier_id: string | null;
  location: string | null;
  formation_id?: string | null;
};
type FormationRow = { id: string; title: string; created_at: string | null; metadata: unknown };
type ParticipantRow = { session_id: string; participant_kind: string; learner_id: string | null; trainer_id: string | null; source: string };
type Person = { id: string; first_name: string | null; last_name: string | null };

const TZ = 'Europe/Paris';
const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const weekFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' });
const hoursFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const fmtH = (h: number) => `${hoursFmt.format(h)} h`;
const monthFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, month: 'short' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric' });
const clock = (d: Date) => {
  const [h, m] = timeFmt.format(d).split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};

// Petit calendrier : le mois sur un bandeau à la couleur de la formation, le jour en gros.
function CalendarTile({ date, color, muted }: { date: Date; color: string; muted: boolean }) {
  return (
    <div className="w-11 shrink-0 rounded-lg border border-zinc-200/80 dark:border-zinc-700 overflow-hidden text-center bg-white dark:bg-zinc-900 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider leading-4 text-white" style={{ background: color, opacity: muted ? 0.8 : 1 }}>
        {monthFmt.format(date).replace('.', '')}
      </div>
      <div className="text-[17px] font-extrabold leading-7 tabular-nums text-zinc-900 dark:text-zinc-100">{dayFmt.format(date)}</div>
    </div>
  );
}

// Barre de créneau : place l'horaire de la séance sur une journée de 8 h à 20 h.
function TimeTrack({ start, end, color }: { start: Date; end: Date; color: string }) {
  const a = clock(start);
  const b = clock(end);
  const left = Math.max(0, Math.min(100, ((a - 8) / 12) * 100));
  const width = Math.max(0, Math.min(100 - left, ((b - a) / 12) * 100));
  return (
    <div
      className="relative mt-2 h-1.5 w-28 rounded-full"
      style={{ background: tintColor(color, 20) }}
      title={`Créneau ${timeFmt.format(start)} – ${timeFmt.format(end)} sur une journée de 8 h à 20 h`}
    >
      {width > 0 ? (
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: color }} />
      ) : (
        <span className="absolute -top-[3px] w-3 h-3 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ left: `calc(${left}% - 6px)`, background: color }} />
      )}
    </div>
  );
}
const fullName = (p: Person | undefined) => (p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '');

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'success' },
  done: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};
const MODALITY_LABEL: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_214px_minmax(0,1.3fr)_88px_104px_100px] gap-4 px-5';

const ACTIONS: { suffix: string; icon: ComponentType<{ className?: string }>; label: string }[] = [
  { suffix: '', icon: Eye, label: 'Ouvrir la session' },
  { suffix: '/emargements', icon: ClipboardCheck, label: 'Émargements' },
  { suffix: '/apprenants', icon: Users, label: 'Participants' },
];

const WEEK_MS = 7 * 24 * 3600 * 1000;
const WEEKS_BEFORE = 8;
const WEEKS_AFTER = 3;

// Lecture par paquets : une liste de centaines d'identifiants dépasserait la longueur d'URL de PostgREST.
async function fetchByIds<T>(
  ids: string[],
  label: string,
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await run(ids.slice(i, i + 150));
    if (error) console.error(`[sessions] lecture ${label} :`, error.message);
    if (Array.isArray(data)) out.push(...(data as T[]));
  }
  return out;
}

function effectifMax(metadata: unknown): number | null {
  const raw = (metadata as { catalog?: { effectifMax?: unknown } } | null)?.catalog?.effectifMax;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

const hoursOf = (s: { starts_at: string; ends_at: string }) =>
  Math.max(0, (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3.6e6);

type Series = { key: string; label: string; color: string };

// Les 4 formations les plus chargées gardent leur couleur ; le reste est regroupé en « Autres ».
function buildSeries(hoursByKey: Map<string, number>, labelOf: (k: string) => string, colorOf: (k: string) => string) {
  const ranked = [...hoursByKey.entries()].filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 4).map(([k]) => k);
  const series: Series[] = top.map((k) => ({ key: k, label: labelOf(k), color: colorOf(k) }));
  if (ranked.length > 4) series.push({ key: '__autres', label: 'Autres formations', color: NEUTRAL_COLOR });
  const indexOf = (k: string) => {
    const i = top.indexOf(k);
    return i >= 0 ? i : series.length - 1;
  };
  return { series, indexOf };
}

function WeeklyChart({ weeks, series, currentIndex, w = 560 }: { weeks: { start: Date; values: number[] }[]; series: Series[]; currentIndex: number; w?: number }) {
  const narrow = w < 400;
  const labelEvery = narrow ? 4 : 3;
  const h = 156;
  const padL = 34;
  const padR = 4;
  const padT = 20;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const totals = weeks.map((wk) => wk.values.reduce((a, b) => a + b, 0));
  const max = Math.max(2, Math.ceil(Math.max(0, ...totals) / 2) * 2);
  const slot = iw / weeks.length;
  const bw = Math.max(6, Math.min(24, slot - (narrow ? 6 : 8)));
  const base = padT + ih;
  const sy = (v: number) => (v / max) * ih;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Heures planifiées par semaine, empilées par formation" className="block overflow-visible">
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={base - sy(t)} y2={base - sy(t)} className="stroke-zinc-200 dark:stroke-zinc-800" />
          <text x={padL - 8} y={base - sy(t) + 3.5} textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums">
            {fmtH(t)}
          </text>
        </g>
      ))}
      {weeks.map((wk, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        const total = totals[i] ?? 0;
        const label = `semaine du ${weekFmt.format(wk.start)}`;
        const parts = wk.values.map((v, k) => ({ v, k })).filter((e) => e.v > 0);
        const segs: ReactElement[] = [];
        let top = base;
        parts.forEach((e, n) => {
          const gap = top < base ? 2 : 0;
          const hh = Math.max(1, sy(e.v) - gap);
          const y0 = top - gap - hh;
          const r = n === parts.length - 1 ? Math.min(4, hh) : 0;
          const d = r
            ? `M${x},${y0 + hh} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + bw - r} Q${x + bw},${y0} ${x + bw},${y0 + r} V${y0 + hh} Z`
            : `M${x},${y0 + hh} V${y0} H${x + bw} V${y0 + hh} Z`;
          const s = series[e.k];
          segs.push(
            <path key={e.k} d={d} style={{ fill: s?.color ?? NEUTRAL_COLOR }}>
              <title>{`${s?.label ?? 'Formation'} · ${label} · ${fmtH(e.v)}`}</title>
            </path>,
          );
          top = y0;
        });
        const isNow = i === currentIndex;
        return (
          <g key={wk.start.toISOString()}>
            {total === 0 && (
              <rect x={x} y={base - 2} width={bw} height={2} rx={1} className="fill-zinc-200 dark:fill-zinc-800">
                <title>{`${label} · aucune session`}</title>
              </rect>
            )}
            {segs}
            {total > 0 && (
              <text x={x + bw / 2} y={top - 6} textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-100 text-[11px] font-bold tabular-nums">
                {fmtH(total)}
              </text>
            )}
            {(i - currentIndex) % labelEvery === 0 && (
              <text
                x={x + bw / 2}
                y={h - 6}
                textAnchor="middle"
                className={isNow ? 'fill-orange-600 dark:fill-orange-400 text-[10px] font-bold' : 'fill-zinc-400 text-[10px]'}
              >
                {isNow ? (narrow ? 'Cette sem.' : 'Cette semaine') : weekFmt.format(wk.start)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const formationId = searchParams.formation ?? '';
  const quand = searchParams.quand === 'a-venir' || searchParams.quand === 'passees' ? searchParams.quand : '';
  const now = Date.now();

  const sb = supabaseServer();

  // IMPORTANT : aucune jointure PostgREST (embed) sur `sessions`.
  // Après la migration 0106 (colonne + FK `sessions.formation_id`), un cache de
  // schéma PostgREST périmé peut casser la résolution des relations de `sessions`
  // et faire échouer TOUTE requête avec embed. On lit donc les sessions À PLAT,
  // puis on rattache dossiers / apprenants / formations / participants par des
  // requêtes séparées (insensibles au cache).
  const FLAT = 'id, title, status, starts_at, ends_at, modality, remote_url, dossier_id, location';

  const [flatRes, { data: formationData }] = await Promise.all([
    sb.schema('app').from('sessions').select(`${FLAT}, formation_id`).order('starts_at', { ascending: false }).limit(500),
    sb.schema('app').from('formations').select('id, title, created_at, metadata').is('deleted_at', null).order('title', { ascending: true }),
  ]);

  // Repli si `formation_id` n'est pas encore dans le cache de schéma → sans.
  let rows = flatRes.data as SessionRow[] | null;
  let sessionErr: { message?: string } | null = flatRes.error;
  if (sessionErr) {
    console.error('[sessions] échec avec formation_id, repli sans:', sessionErr);
    const fb = await sb.schema('app').from('sessions').select(FLAT).order('starts_at', { ascending: false }).limit(500);
    rows = fb.data as SessionRow[] | null;
    sessionErr = fb.error;
    if (sessionErr) console.error('[sessions] échec du repli sessions:', sessionErr);
  }
  const sessionRows = rows ?? [];

  const formations = ((formationData as FormationRow[] | null) ?? []) as FormationRow[];
  const formationsById = new Map(formations.map((f) => [f.id, f]));
  const colors = formationColorMap(formations);
  const colorOf = (id: string | null | undefined) => (id ? colors.get(id) ?? NEUTRAL_COLOR : NEUTRAL_COLOR);

  const sessionIds = sessionRows.map((s) => s.id);
  const dossierIds = [...new Set(sessionRows.map((s) => s.dossier_id).filter(Boolean))] as string[];

  const [dossierRows, participantRows] = await Promise.all([
    fetchByIds<{ id: string; reference: string; learner_id: string | null; formation_id: string | null }>(dossierIds, 'dossiers', (ids) =>
      sb.schema('app').from('dossiers').select('id, reference, learner_id, formation_id').in('id', ids),
    ),
    fetchByIds<ParticipantRow>(sessionIds, 'participants', (ids) =>
      sb.schema('app').from('session_participants').select('session_id, participant_kind, learner_id, trainer_id, source').in('session_id', ids),
    ),
  ]);
  const dossiersById = new Map(dossierRows.map((d) => [d.id, d]));

  const activeParticipants = participantRows.filter((p) => p.source !== 'manual_remove');
  const learnerIds = [
    ...new Set([...dossierRows.map((d) => d.learner_id), ...activeParticipants.map((p) => p.learner_id)].filter(Boolean)),
  ] as string[];
  const trainerIds = [...new Set(activeParticipants.map((p) => p.trainer_id).filter(Boolean))] as string[];

  const [learnerRows, trainerRows] = await Promise.all([
    fetchByIds<Person>(learnerIds, 'apprenants', (ids) => sb.schema('app').from('learners').select('id, first_name, last_name').in('id', ids)),
    fetchByIds<Person>(trainerIds, 'formateurs', (ids) => sb.schema('app').from('trainers').select('id, first_name, last_name').in('id', ids)),
  ]);
  const learnersById = new Map(learnerRows.map((l) => [l.id, l]));
  const trainersById = new Map(trainerRows.map((t) => [t.id, t]));

  const participantsBySession = new Map<string, { learners: Set<string>; trainers: Set<string> }>();
  for (const p of activeParticipants) {
    const entry = participantsBySession.get(p.session_id) ?? { learners: new Set<string>(), trainers: new Set<string>() };
    if (p.participant_kind === 'learner' && p.learner_id) entry.learners.add(p.learner_id);
    if (p.participant_kind === 'trainer' && p.trainer_id) entry.trainers.add(p.trainer_id);
    participantsBySession.set(p.session_id, entry);
  }

  const all = sessionRows.map((s) => {
    const d = s.dossier_id ? dossiersById.get(s.dossier_id) : undefined;
    const fid = s.formation_id ?? d?.formation_id ?? null;
    const formation = fid ? formationsById.get(fid) ?? null : null;
    const parts = participantsBySession.get(s.id);
    const learnerCount = parts?.learners.size || (d?.learner_id ? 1 : 0);
    const learnerName = d?.learner_id ? fullName(learnersById.get(d.learner_id)) : '';
    const trainers = [...(parts?.trainers ?? [])].map((id) => fullName(trainersById.get(id))).filter(Boolean);
    return {
      ...s,
      formation,
      color: colorOf(formation?.id),
      reference: d?.reference ?? null,
      isGroup: !d,
      learnerName,
      learnerCount,
      capacity: formation ? effectifMax(formation.metadata) : null,
      trainers,
      isPast: new Date(s.ends_at).getTime() < now,
    };
  });

  const matchesSearch = (s: (typeof all)[number]) => {
    if (formationId && s.formation?.id !== formationId) return false;
    if (!q) return true;
    const hay = `${s.title ?? ''} ${s.reference ?? ''} ${s.formation?.title ?? ''} ${s.learnerName} ${s.trainers.join(' ')} ${s.location ?? ''}`.toLowerCase();
    return hay.includes(q);
  };
  const searched = all.filter(matchesSearch);
  const upcomingCount = searched.filter((s) => !s.isPast).length;
  const pastCount = searched.length - upcomingCount;
  const filtered = searched
    .filter((s) => (quand === 'a-venir' ? !s.isPast : quand === 'passees' ? s.isPast : true))
    // À venir d'abord (la plus proche en tête), puis les passées (la plus récente en tête).
    .sort((a, b) => {
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
      const ta = new Date(a.starts_at).getTime();
      const tb = new Date(b.starts_at).getTime();
      return a.isPast ? tb - ta : ta - tb;
    });

  // ── Synthèse et graphiques (sur les sessions affichées) ──
  const formationKey = (s: (typeof all)[number]) => s.formation?.id ?? '__hors';
  const labelOf = (k: string) => (k === '__hors' ? 'Hors formation' : formationsById.get(k)?.title ?? 'Formation');
  const keyColor = (k: string) => (k === '__hors' ? NEUTRAL_COLOR : colorOf(k));

  const totalHours = filtered.reduce((a, s) => a + hoursOf(s), 0);
  const upcomingHours = filtered.filter((s) => !s.isPast).reduce((a, s) => a + hoursOf(s), 0);
  const hoursByFormation = new Map<string, number>();
  for (const s of filtered) hoursByFormation.set(formationKey(s), (hoursByFormation.get(formationKey(s)) ?? 0) + hoursOf(s));
  const split = buildSeries(hoursByFormation, labelOf, keyColor);
  const splitTotals = split.series.map(() => 0);
  for (const s of filtered) {
    const i = split.indexOf(formationKey(s));
    splitTotals[i] = (splitTotals[i] ?? 0) + hoursOf(s);
  }

  const firstWeek = mondayOf(new Date(now - WEEKS_BEFORE * WEEK_MS));
  const weekCount = WEEKS_BEFORE + 1 + WEEKS_AFTER;
  const inWindow = filtered.filter((s) => {
    const t = new Date(s.starts_at).getTime();
    return t >= firstWeek.getTime() && t < firstWeek.getTime() + weekCount * WEEK_MS;
  });
  const windowHours = new Map<string, number>();
  for (const s of inWindow) windowHours.set(formationKey(s), (windowHours.get(formationKey(s)) ?? 0) + hoursOf(s));
  const chart = buildSeries(windowHours, labelOf, keyColor);
  const weeks = Array.from({ length: weekCount }, (_, i) => ({
    start: new Date(firstWeek.getTime() + i * WEEK_MS),
    values: chart.series.map(() => 0),
  }));
  for (const s of inWindow) {
    const wi = Math.floor((new Date(s.starts_at).getTime() - firstWeek.getTime()) / WEEK_MS);
    const wk = weeks[wi];
    const k = chart.indexOf(formationKey(s));
    if (wk && k >= 0) wk.values[k] = (wk.values[k] ?? 0) + hoursOf(s);
  }

  const hoursByModality = new Map<string, number>();
  for (const s of filtered) hoursByModality.set(s.modality, (hoursByModality.get(s.modality) ?? 0) + hoursOf(s));
  const modalityRows = [...hoursByModality.entries()].sort((a, b) => b[1] - a[1]);

  const link = (params: Partial<SearchParams>) => {
    const sp = new URLSearchParams();
    const merged = { q: searchParams.q, formation: formationId || undefined, quand: quand || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/sessions?${qs}` : '/sessions';
  };
  const segments: { value: '' | 'a-venir' | 'passees'; label: string; count: number }[] = [
    { value: '', label: 'Toutes', count: searched.length },
    { value: 'a-venir', label: 'À venir', count: upcomingCount },
    { value: 'passees', label: 'Passées', count: pastCount },
  ];

  return (
    <div className="max-w-[1600px] w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Planification</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Sessions</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
            {filtered.length} session{filtered.length > 1 ? 's' : ''} · {fmtH(totalHours)} planifiées
          </p>
        </div>
        <ManageOnly section="catalogue">
          <Link
            href="/sessions/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Planifier une session
          </Link>
        </ManageOnly>
      </header>

      {/* Les trois graphiques en bande au-dessus du tableau (demande utilisateur). */}
      <div>
      {filtered.length > 0 && (
        <aside className="grid gap-4 md:grid-cols-3 items-stretch mb-6" aria-label="Synthèse">
          <div className="rounded-xl p-5 bg-zinc-900 dark:bg-zinc-800/60 text-white">
            <p className="text-[12px] font-semibold text-white/60">Heures planifiées</p>
            <p className="text-[36px] leading-none font-extrabold tabular-nums mt-2 tracking-tight">{fmtH(totalHours)}</p>
            <p className="text-[12px] text-white/60 mt-2 tabular-nums">dont {fmtH(upcomingHours)} à venir</p>
            {totalHours > 0 && (
              <>
                <div className="mt-4 flex h-2 gap-[2px] rounded-full overflow-hidden">
                  {split.series.map((s, i) => (
                    <span key={s.key} style={{ width: `${((splitTotals[i] ?? 0) / totalHours) * 100}%`, background: s.color }} title={`${s.label} · ${fmtH(splitTotals[i] ?? 0)}`} />
                  ))}
                </div>
                <ul className="mt-3 grid gap-1.5 text-[12px]">
                  {split.series.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: s.color }} />
                      <span className="truncate">{s.label}</span>
                      <span className="ml-auto tabular-nums text-white/70">{fmtH(splitTotals[i] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 min-w-0">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Heures par semaine</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {chart.series.map((s) => (
                  <li key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} />
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <WeeklyChart weeks={weeks} series={chart.series} currentIndex={WEEKS_BEFORE} w={460} />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 mb-3">Par modalité</p>
            <ul className="grid gap-3">
              {modalityRows.map(([m, hrs]) => (
                <li key={m} title={`${MODALITY_LABEL[m] ?? m} · ${fmtH(hrs)}`}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{MODALITY_LABEL[m] ?? m}</span>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {fmtH(hrs)} · {totalHours > 0 ? Math.round((hrs / totalHours) * 100) : 0} %
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-orange-100 dark:bg-orange-950/50">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${totalHours > 0 ? (hrs / totalHours) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}

      <div className="min-w-0">
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <form action="/sessions" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une session, un apprenant, un lieu…"
            className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] w-80 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
          {formationId && <input type="hidden" name="formation" value={formationId} />}
          {quand && <input type="hidden" name="quand" value={quand} />}
        </form>
        <FilterDropdown
          label="Formation"
          paramName="formation"
          options={formations.map((f) => ({ value: f.id, label: f.title }))}
          selected={formationId ? [formationId] : []}
          basePath="/sessions"
          preserved={{ q: searchParams.q || undefined, quand: quand || undefined }}
        />
        {(formationId || q || quand) && (
          <Link
            href="/sessions"
            className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-9 inline-flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            Réinitialiser
          </Link>
        )}
        <nav aria-label="Période" className="ml-auto inline-flex p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70 text-[12px]">
          {segments.map((seg) => (
            <Link
              key={seg.label}
              href={link({ quand: seg.value || undefined })}
              aria-current={quand === seg.value ? 'page' : undefined}
              className={
                quand === seg.value
                  ? 'px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold shadow-sm tabular-nums'
                  : 'px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100 tabular-nums'
              }
            >
              {seg.label} {seg.count}
            </Link>
          ))}
        </nav>
      </div>

      {sessionErr && (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
          Impossible de charger les sessions pour le moment (erreur base de données). Réessayez dans un instant ;
          si le problème persiste, contactez le support.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={CalendarClock}
            title={searched.length ? 'Aucune session sur cette période.' : 'Aucune session.'}
            description="Planifiez une session de groupe rattachée à une formation, ou depuis un dossier. Elle apparaîtra ici avec son formateur, son lieu et ses participants."
            action={
              <ManageOnly section="catalogue">
                <Link
                  href="/sessions/nouvelle"
                  className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Planifier une session
                </Link>
              </ManageOnly>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Formation</div>
              <div>Formateur</div>
              <div>Dates</div>
              <div>Lieu</div>
              <div>Participants</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filtered.map((s) => {
                const st = STATUS[s.status] ?? { label: s.status, tone: 'neutral' as const };
                const start = new Date(s.starts_at);
                const end = new Date(s.ends_at);
                const sameDay = dateFmt.format(start) === dateFmt.format(end);
                const remote = s.modality !== 'presentiel';
                const joinUrl = s.remote_url;
                const fill = s.capacity ? Math.min(1, s.learnerCount / s.capacity) : 0;
                const full = s.capacity !== null && s.learnerCount >= s.capacity;
                return (
                  <li key={s.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors ${s.isPast ? 'opacity-[0.92]' : ''}`}>
                    <div className="min-w-0 flex gap-3">
                      <span className="mt-[5px] w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} />
                      <div className="min-w-0">
                        {s.formation ? (
                          <Link href={`/formations/${s.formation.id}`} className="block truncate text-[14px] font-extrabold hover:underline" style={{ color: deepColor(s.color) }}>
                            {s.formation.title}
                          </Link>
                        ) : (
                          <span className="block truncate text-[14px] font-extrabold text-zinc-500">Hors formation</span>
                        )}
                        <Link href={`/sessions/${s.id}`} className="block truncate text-[13px] font-semibold text-[color:var(--sess)] hover:underline mt-0.5">
                          {s.title || 'Session'}
                        </Link>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                          {s.isGroup ? 'Session de groupe' : s.learnerName || s.reference || 'Dossier individuel'}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0 text-[13px]">
                      {s.trainers.length ? (
                        <p className="text-zinc-900 dark:text-zinc-100 font-semibold truncate" title={s.trainers.join(', ')}>
                          {s.trainers[0]}
                          {s.trainers.length > 1 && <span className="text-zinc-500 font-medium"> +{s.trainers.length - 1}</span>}
                        </p>
                      ) : (
                        <p className="text-zinc-400">Non affecté</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 min-w-0">
                      <CalendarTile date={start} color={s.color} muted={s.isPast} />
                      <div className="min-w-0 text-[13px] tabular-nums leading-tight">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{dateFmt.format(start)}</p>
                        {sameDay ? (
                          <>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                              {timeFmt.format(start)} – {timeFmt.format(end)}
                            </p>
                            <TimeTrack start={start} end={end} color={s.color} />
                          </>
                        ) : (
                          <p className="text-zinc-500 dark:text-zinc-400 mt-1">→ {dateFmt.format(end)}</p>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 text-[13px]">
                      {remote && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            <Video className="w-3.5 h-3.5" />
                            {MODALITY_LABEL[s.modality] ?? s.modality}
                          </span>
                          {joinUrl && (
                            <a
                              href={joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-6 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition"
                            >
                              Rejoindre <ArrowUpRight className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                      {(!remote || s.location) && (
                        <p className={`flex gap-1.5 ${remote ? 'mt-1.5' : ''}`}>
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400" />
                          {s.location ? (
                            <span className="text-zinc-700 dark:text-zinc-300 line-clamp-2">{s.location}</span>
                          ) : (
                            <span className="text-zinc-400">Lieu à préciser</span>
                          )}
                        </p>
                      )}
                    </div>

                    <div title={s.capacity ? `${s.learnerCount} inscrit${s.learnerCount > 1 ? 's' : ''} sur ${s.capacity} places` : `${s.learnerCount} inscrit${s.learnerCount > 1 ? 's' : ''}`}>
                      <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        {s.learnerCount}
                        {s.capacity && <span className="text-zinc-400 font-semibold">/{s.capacity}</span>}
                      </p>
                      {s.capacity && (
                        <div className="mt-1.5 h-1.5 w-16 rounded-full" style={{ background: tintColor(s.color, 18) }}>
                          <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: full ? '#D98A00' : s.color }} />
                        </div>
                      )}
                    </div>

                    <div>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </div>

                    <div className="flex items-center justify-end gap-0.5">
                      {ACTIONS.map(({ suffix, icon: Icon, label }) => (
                        <Link
                          key={label}
                          href={`/sessions/${s.id}${suffix}`}
                          aria-label={`${label} — ${s.title || 'session'}`}
                          title={label}
                          className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                        >
                          <Icon className="w-4 h-4" />
                        </Link>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
