// ARCHETYPE: command
// Justification: pipeline réel des dossiers — recherche + filtres statut, vues liste/grille/kanban colorées par statut, RLS-scopé.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { Plus, Search, FolderOpen, List, LayoutGrid, Columns3, Eye, CalendarClock, FileText } from 'lucide-react';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { dossierStatusLabel } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { StatusFilter } from './status-filter.client';
import { DossierStatusControl } from './[id]/dossier-status-control.client';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';

const STATUSES = ['draft', 'pending_validation', 'scheduled', 'active', 'completed', 'closed', 'archived', 'cancelled'] as const;

// Couleur par statut : barre latérale des cartes + en-tête de colonne kanban.
const STATUS_ACCENT: Record<string, { bar: string; head: string }> = {
  draft: { bar: 'border-l-zinc-400', head: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300' },
  pending_validation: { bar: 'border-l-amber-500', head: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  scheduled: { bar: 'border-l-sky-500', head: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  active: { bar: 'border-l-emerald-500', head: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  completed: { bar: 'border-l-blue-500', head: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' },
  closed: { bar: 'border-l-slate-500', head: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300' },
  archived: { bar: 'border-l-stone-400', head: 'bg-stone-100 text-stone-600 dark:bg-stone-800/50 dark:text-stone-300' },
  cancelled: { bar: 'border-l-rose-500', head: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
};

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_112px_112px_128px_108px] gap-4 px-5';

const ACTIONS: { suffix: string; icon: ComponentType<{ className?: string }>; label: string }[] = [
  { suffix: '', icon: Eye, label: 'Ouvrir le dossier' },
  { suffix: '/sessions', icon: CalendarClock, label: 'Sessions' },
  { suffix: '/documents', icon: FileText, label: 'Documents' },
];

type ViewMode = 'list' | 'grid' | 'kanban';
type SearchParams = { q?: string; status?: string | string[]; view?: string };

type Row = {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  total_amount_cents: number | null;
  status: string;
  qualiopi_ready: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  company: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formation: any;
};

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const fmtEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;
const learnerName = (d: Row) => [d.learner?.first_name, d.learner?.last_name].filter(Boolean).join(' ') || '—';

function DossierCard({ d }: { d: Row }) {
  const accent = STATUS_ACCENT[d.status] ?? STATUS_ACCENT.draft!;
  return (
    <Link
      href={`/dossiers/${d.id}`}
      className={`block bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 border-l-4 ${accent.bar} rounded-xl shadow-sm p-4 hover:shadow-md transition`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <IdPill>{d.reference}</IdPill>
        <DossierStatusControl dossierId={d.id} status={d.status as DossierStatus} compact />
      </div>
      <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{learnerName(d)}</p>
      <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300 truncate mt-0.5">{d.formation?.title ?? '—'}</p>
      {d.company?.name && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{d.company.name}</p>}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80">
        <span className="tabular-nums text-[12px] text-zinc-500 dark:text-zinc-400">{fmtDate(d.start_date)} → {fmtDate(d.end_date)}</span>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmtEuros(d.total_amount_cents)}</span>
      </div>
    </Link>
  );
}

export default async function DossiersPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim();
  const view: ViewMode = searchParams.view === 'grid' || searchParams.view === 'kanban' ? searchParams.view : 'list';
  const statuses = Array.isArray(searchParams.status)
    ? searchParams.status
    : searchParams.status
      ? [searchParams.status]
      : [];

  const sb = supabaseServer();
  // RLS-scopé : staff voit tout, formateur seulement ses dossiers (F-CRM-08).
  let query = sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, start_date, end_date, total_amount_cents, status, qualiopi_ready, ' +
        'learner:learners(first_name, last_name), company:companies(name), formation:formations(title)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (statuses.length) query = query.in('status', statuses as DossierStatus[]);
  if (q) query = query.ilike('reference', `%${q}%`);

  const { data } = await query;
  const rows = (data as Row[] | null) ?? [];

  // Filtre apprenant/formation côté serveur (les embeds ne sont pas filtrables en ilike).
  const filtered = q
    ? rows.filter((d) => {
        const hay = `${d.reference} ${d.learner?.first_name ?? ''} ${d.learner?.last_name ?? ''} ${d.formation?.title ?? ''}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : rows;

  // Href de vue en préservant recherche + statuts.
  const withView = (v: ViewMode) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    statuses.forEach((s) => p.append('status', s));
    if (v !== 'list') p.set('view', v);
    const qs = p.toString();
    return qs ? `/dossiers?${qs}` : '/dossiers';
  };

  const viewBtn = (v: ViewMode, Icon: typeof List, label: string) => (
    <Link
      href={withView(v)}
      aria-label={label}
      title={label}
      aria-current={view === v ? 'page' : undefined}
      className={`h-8 w-8 flex items-center justify-center rounded-md transition ${
        view === v ? 'bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
      }`}
    >
      <Icon className="w-4 h-4" />
    </Link>
  );

  // Colonnes kanban : statuts filtrés si sélection, sinon tous.
  const kanbanStatuses = statuses.length ? STATUSES.filter((s) => statuses.includes(s)) : STATUSES;

  const maxW = view === 'kanban' ? 'max-w-[1600px]' : 'max-w-7xl';
  const totalCents = filtered.reduce((sum, d) => sum + (d.total_amount_cents ?? 0), 0);

  return (
    <div className={`${maxW} w-full mx-auto px-8 py-9`}>
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Tous les dossiers</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Dossiers</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            {filtered.length > 0 && <> · {fmtEuros(totalCents)}</>}
          </p>
        </div>
        <ManageOnly section="dossiers">
          <Link
            href="/dossiers/nouveau"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau dossier
          </Link>
        </ManageOnly>
      </header>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <form action="/dossiers" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une référence, un apprenant…"
            className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] w-80 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
          {statuses.map((s) => (
            <input key={s} type="hidden" name="status" value={s} />
          ))}
          {view !== 'list' && <input type="hidden" name="view" value={view} />}
        </form>

        <StatusFilter
          options={STATUSES.map((s) => ({ value: s, label: dossierStatusLabel(s) }))}
          selected={statuses}
          q={q || undefined}
          view={view !== 'list' ? view : undefined}
        />
        {(statuses.length > 0 || q) && (
          <Link
            href={view !== 'list' ? `/dossiers?view=${view}` : '/dossiers'}
            className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-9 inline-flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            Réinitialiser
          </Link>
        )}

        {/* Sélecteur de vue */}
        <nav aria-label="Vue" className="ml-auto inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70">
          {viewBtn('list', List, 'Vue liste')}
          {viewBtn('grid', LayoutGrid, 'Vue grille')}
          {viewBtn('kanban', Columns3, 'Vue kanban')}
        </nav>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={FolderOpen}
            title="Aucun dossier ne correspond."
            description="Élargissez la recherche ou réinitialisez les filtres."
            action={
              <Link
                href={view !== 'list' ? `/dossiers?view=${view}` : '/dossiers'}
                className="border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 h-8 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-2"
              >
                Réinitialiser
              </Link>
            }
          />
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {kanbanStatuses.map((s) => {
            const col = filtered.filter((d) => d.status === s);
            const accent = STATUS_ACCENT[s]!;
            return (
              <div key={s} className="w-72 shrink-0 flex flex-col">
                <div className={`flex items-center justify-between px-3 h-9 rounded-t-xl text-[12px] font-bold ${accent.head}`}>
                  <span>{dossierStatusLabel(s)}</span>
                  <span className="tabular-nums opacity-70">{col.length}</span>
                </div>
                <div className="flex-1 bg-zinc-100/60 dark:bg-zinc-950/40 rounded-b-xl p-2 space-y-2 min-h-[80px]">
                  {col.length === 0 ? (
                    <p className="text-[12px] text-zinc-400 dark:text-zinc-600 text-center py-4">—</p>
                  ) : (
                    col.map((d) => <DossierCard key={d.id} d={d} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((d) => (
            <DossierCard key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[960px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Apprenant</div>
              <div>Formation</div>
              <div>Dates</div>
              <div className="text-right">Montant</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filtered.map((d) => (
                <li key={d.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                  <div className="min-w-0">
                    <Link href={`/dossiers/${d.id}`} className="block truncate text-[14px] font-extrabold text-zinc-900 dark:text-zinc-100 hover:underline">
                      {learnerName(d)}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 min-w-0">
                      <IdPill className="shrink-0">{d.reference}</IdPill>
                      {d.company?.name && <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{d.company.name}</span>}
                    </div>
                  </div>

                  <div className="min-w-0 text-[13px] font-bold text-zinc-800 dark:text-zinc-200 truncate" title={d.formation?.title ?? undefined}>
                    {d.formation?.title ?? <span className="font-normal text-zinc-400">—</span>}
                  </div>

                  <div className="text-[13px] tabular-nums leading-tight">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{fmtDate(d.start_date)}</p>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">→ {fmtDate(d.end_date)}</p>
                  </div>

                  <div className="text-right text-[14px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {fmtEuros(d.total_amount_cents)}
                  </div>

                  <div>
                    <DossierStatusControl dossierId={d.id} status={d.status as DossierStatus} compact />
                  </div>

                  <div className="flex items-center justify-end gap-0.5">
                    {ACTIONS.map(({ suffix, icon: Icon, label }) => (
                      <Link
                        key={label}
                        href={`/dossiers/${d.id}${suffix}`}
                        aria-label={`${label} — ${d.reference}`}
                        title={label}
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <Icon className="w-4 h-4" />
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
