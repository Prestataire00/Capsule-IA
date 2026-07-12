// ARCHETYPE: command
// Justification: vue transversale de toutes les sessions de l'organisme — retrouver/filtrer par formation, RLS-scopé.

import Link from 'next/link';
import { Search, Video, CalendarClock } from 'lucide-react';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { FilterDropdown } from '@/shared/components/filters/filter-dropdown.client';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; formation?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionRow = any;

const TZ = 'Europe/Paris';
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'success' },
  done: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};

const modalityLabel: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

function SessionItem({ s }: { s: SessionRow }) {
  const st = STATUS[s.status] ?? { label: s.status, tone: 'neutral' as const };
  const learner = s.dossier?.learner ? [s.dossier.learner.first_name, s.dossier.learner.last_name].filter(Boolean).join(' ') : null;
  const formation = s.dossier?.formation;
  return (
    <li className="grid grid-cols-[150px_1fr_1fr_130px_100px] gap-3 py-3 px-4 text-[13px] items-center hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
      <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="capitalize">{dayFmt.format(new Date(s.starts_at))}</span>
        <br />
        {timeFmt.format(new Date(s.starts_at))} – {timeFmt.format(new Date(s.ends_at))}
      </div>
      <div className="min-w-0">
        <Link href={`/dossiers/${s.dossier?.id}/sessions`} className="text-zinc-900 dark:text-zinc-100 hover:text-violet-600 truncate block">
          {s.title || 'Session'}
        </Link>
        {learner && <span className="text-[11px] text-zinc-400">{learner}</span>}
      </div>
      <div className="min-w-0">
        {formation ? (
          <Link href={`/formations/${formation.id}`} className="text-zinc-700 dark:text-zinc-300 hover:text-violet-600 truncate block">
            {formation.title}
          </Link>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </div>
      <div className="text-zinc-500 dark:text-zinc-400 text-[12px]">
        {modalityLabel[s.modality] ?? s.modality}
        {s.remote_url && (
          <a href={s.remote_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline">
            <Video className="w-3 h-3" /> Visio
          </a>
        )}
      </div>
      <div><StatusPill tone={st.tone}>{st.label}</StatusPill></div>
    </li>
  );
}

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const formationId = searchParams.formation ?? '';

  const sb = supabaseServer();
  const [{ data: sessionData }, { data: formationData }] = await Promise.all([
    sb
      .schema('app')
      .from('sessions')
      .select(
        'id, title, status, starts_at, ends_at, modality, remote_url, ' +
          'dossier:dossiers(id, reference, learner:learners(first_name, last_name), formation:formations(id, title))',
      )
      .order('starts_at', { ascending: false })
      .limit(500),
    sb.schema('app').from('formations').select('id, title').is('deleted_at', null).order('title', { ascending: true }),
  ]);

  const all = (sessionData as SessionRow[] | null) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formations = ((formationData as any[]) ?? []) as { id: string; title: string }[];

  const filtered = all.filter((s) => {
    if (formationId && s.dossier?.formation?.id !== formationId) return false;
    if (q) {
      const learner = s.dossier?.learner ? `${s.dossier.learner.first_name ?? ''} ${s.dossier.learner.last_name ?? ''}` : '';
      const hay = `${s.title ?? ''} ${s.dossier?.reference ?? ''} ${s.dossier?.formation?.title ?? ''} ${learner}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const now = Date.now();
  const upcoming = filtered.filter((s) => new Date(s.starts_at).getTime() >= now).reverse();
  const past = filtered.filter((s) => new Date(s.starts_at).getTime() < now);

  const listHeader = (
    <li className="grid grid-cols-[150px_1fr_1fr_130px_100px] gap-3 py-2.5 px-4 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
      <div>Quand</div>
      <div>Session</div>
      <div>Formation</div>
      <div>Modalité</div>
      <div>Statut</div>
    </li>
  );

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-10">
      <header className="mb-8">
        <SectionLabel className="mb-2">Planification</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Sessions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {filtered.length} session{filtered.length > 1 ? 's' : ''} · toutes formations confondues
        </p>
      </header>

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <form action="/sessions" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une session, un apprenant…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
          {formationId && <input type="hidden" name="formation" value={formationId} />}
        </form>

        <div className="ml-auto flex items-center gap-2">
          <FilterDropdown
            label="Formation"
            paramName="formation"
            options={formations.map((f) => ({ value: f.id, label: f.title }))}
            selected={formationId ? [formationId] : []}
            basePath="/sessions"
            preserved={{ q: searchParams.q || undefined }}
          />
          {(formationId || q) && (
            <Link
              href="/sessions"
              className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              Réinitialiser
            </Link>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState
            icon={CalendarClock}
            title="Aucune session."
            description="Planifiez des sessions depuis un dossier ; elles apparaîtront ici, regroupées par formation."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">À venir ({upcoming.length})</h2>
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
                {listHeader}
                {upcoming.map((s) => (
                  <SessionItem key={s.id} s={s} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">Passées ({past.length})</h2>
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
                {listHeader}
                {past.map((s) => (
                  <SessionItem key={s.id} s={s} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
