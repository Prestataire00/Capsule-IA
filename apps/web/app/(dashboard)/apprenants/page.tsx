// ARCHETYPE: command
// Justification: vue carnet apprenants — chiffres clés, recherche, une ligne par apprenant avec ses infos clés.

import Link from 'next/link';
import { Plus, Search, Users, Accessibility, GraduationCap, TrendingUp, Eye, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { AnonymizeAction } from '../rgpd/anonymize-action';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { FilterDropdown } from '@/shared/components/filters/filter-dropdown.client';

export const dynamic = 'force-dynamic';

type LearnerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string | null;
  rqth: boolean;
  position: string | null;
  created_at: string;
  anonymized_at: string | null;
  company: { name: string } | null;
};

type FilterKey = 'all' | 'in_formation' | 'rqth' | 'no_company';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'in_formation', label: 'En formation' },
  { key: 'rqth', label: 'RQTH' },
  { key: 'no_company', label: 'Sans entreprise' },
];

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(150px,0.9fr)] gap-4 px-5';

function KeyFigure({
  label,
  value,
  hint,
  hintClassName,
  icon: Icon,
  href,
  active,
}: {
  label: string;
  value: number;
  hint: string;
  hintClassName?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        {href ? (
          <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-600 transition" />
        ) : (
          <Icon className="w-4 h-4 text-zinc-400" />
        )}
      </div>
      <p className="mt-2 text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
      <p className={`mt-2 text-[12px] ${hintClassName ?? 'text-zinc-500 dark:text-zinc-400'}`}>{hint}</p>
    </>
  );
  const cls = `group block rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-sm transition ${
    active
      ? 'border-orange-300 dark:border-orange-800 ring-4 ring-orange-500/10'
      : 'border-zinc-200/70 dark:border-zinc-800'
  }`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-orange-200 dark:hover:border-orange-900/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function ApprenantsPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const sb = supabaseServer();

  // Rôle de l'utilisateur courant (owner/admin) pour autoriser l'anonymisation RGPD.
  const { data: auth } = await sb.auth.getUser();
  const { data: memberData } = auth.user
    ? await sb
        .schema('app')
        .from('members')
        .select('role')
        .eq('user_id', auth.user.id)
        .is('deleted_at', null)
        .order('is_default_org', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const role = (memberData as { role: string } | null)?.role;
  const isOwnerAdmin = role === 'owner' || role === 'admin';

  // Apprenants (RLS-scopé à l'organisation) + entreprise rattachée.
  const { data: learnersData } = await sb
    .schema('app')
    .from('learners')
    .select('id, first_name, last_name, email, company_id, rqth, position, created_at, anonymized_at, company:companies(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const learners = (learnersData as unknown as LearnerRow[] | null) ?? [];

  // Apprenants en formation = ceux avec un dossier actif/planifié.
  const { data: activeDossiers } = await sb
    .schema('app')
    .from('dossiers')
    .select('learner_id, status')
    .is('deleted_at', null)
    .in('status', ['active', 'scheduled']);
  const inFormationIds = new Set(
    ((activeDossiers as unknown as { learner_id: string }[] | null) ?? []).map((d) => d.learner_id),
  );

  const inFormation = Array.from(inFormationIds);
  const rqthCount = learners.filter((l) => l.rqth).length;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const newThisMonth = learners.filter((l) => new Date(l.created_at) >= startOfMonth).length;

  const q = (searchParams.q ?? '').trim().toLowerCase();
  const activeFilter: FilterKey =
    FILTERS.some((f) => f.key === searchParams.filter)
      ? (searchParams.filter as FilterKey)
      : 'all';

  const filteredLearners = learners.filter((l) => {
    if (activeFilter === 'in_formation' && !inFormationIds.has(l.id)) return false;
    if (activeFilter === 'rqth' && !l.rqth) return false;
    if (activeFilter === 'no_company' && l.company_id) return false;
    if (q) {
      const haystack = `${l.first_name} ${l.last_name} ${l.email} ${l.position ?? ''} ${l.company?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const filterHref = (key: FilterKey): string => {
    const sp = new URLSearchParams();
    if (key !== 'all') sp.set('filter', key);
    if (q) sp.set('q', q);
    const qs = sp.toString();
    return qs ? `/apprenants?${qs}` : '/apprenants';
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Relations</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Apprenants</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            <span className="tabular-nums">{learners.length} apprenants</span> suivis dans votre OF.
          </p>
        </div>
        <ManageOnly section="dossiers">
          <Link
            href="/apprenants/nouveau"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvel apprenant
          </Link>
        </ManageOnly>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KeyFigure label="Total apprenants" value={learners.length} icon={Users} hint="dans le carnet" href={filterHref('all')} active={activeFilter === 'all'} />
        <KeyFigure
          label="En formation"
          value={inFormation.length}
          icon={GraduationCap}
          hint="dossiers actifs/planifiés"
          href={filterHref('in_formation')}
          active={activeFilter === 'in_formation'}
        />
        <KeyFigure label="RQTH" value={rqthCount} icon={Accessibility} hint="adaptations à prévoir" href={filterHref('rqth')} active={activeFilter === 'rqth'} />
        <KeyFigure
          label="Nouveaux ce mois"
          value={newThisMonth}
          icon={TrendingUp}
          hint="↑ 1 vs mois dernier"
          hintClassName="text-emerald-600 dark:text-emerald-500 tabular-nums"
        />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <form method="get" action="/apprenants" className="relative">
          {activeFilter !== 'all' && (
            <input type="hidden" name="filter" value={activeFilter} />
          )}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher un apprenant…"
            className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] w-80 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
        </form>
        <div className="flex items-center gap-2">
          <FilterDropdown
            label="Filtre"
            paramName="filter"
            options={FILTERS.filter((f) => f.key !== 'all').map((f) => ({ value: f.key, label: f.label }))}
            selected={activeFilter !== 'all' ? [activeFilter] : []}
            basePath="/apprenants"
            preserved={{ q: q || undefined }}
          />
          {(q || activeFilter !== 'all') && (
            <Link
              href="/apprenants"
              className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-9 inline-flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              Réinitialiser
            </Link>
          )}
        </div>
      </div>

      {(q || activeFilter !== 'all') && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3 px-1 tabular-nums">
          {filteredLearners.length === 0
            ? 'Aucun apprenant ne correspond.'
            : `${filteredLearners.length} apprenant${filteredLearners.length > 1 ? 's' : ''} sur ${learners.length}`}
          {(q || activeFilter !== 'all') && (
            <>
              {' · '}
              <Link href="/apprenants" className="text-orange-600 dark:text-orange-400 hover:underline">
                Réinitialiser
              </Link>
            </>
          )}
        </p>
      )}

      {filteredLearners.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={Users}
            title={learners.length === 0 ? 'Aucun apprenant dans votre carnet.' : 'Aucun apprenant ne correspond.'}
            description={learners.length === 0 ? 'Ajoutez un apprenant pour pouvoir le rattacher à un dossier.' : 'Essayez un autre filtre ou une autre recherche.'}
            action={
              <Link
                href="/apprenants/nouveau"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouvel apprenant
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[960px]">
            <div
              className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}
            >
              <div>Apprenant</div>
              <div>Entreprise</div>
              <div>E-mail</div>
              <div>Suivi</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filteredLearners.map((l) => {
                const initials = `${l.first_name[0] ?? ''}${l.last_name[0] ?? ''}`.toUpperCase();
                const company = l.company;
                const activeDossier = inFormationIds.has(l.id);
                const name = `${l.first_name} ${l.last_name}`;
                return (
                  <li key={l.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold flex-shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/apprenants/${l.id}`}
                          className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          {name}
                        </Link>
                        {l.position && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{l.position}</p>}
                      </div>
                    </div>
                    <div className="min-w-0">
                      {company ? (
                        <span className="block truncate text-zinc-700 dark:text-zinc-300">{company.name}</span>
                      ) : !l.company_id ? (
                        <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          indép.
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div className="min-w-0 truncate text-zinc-600 dark:text-zinc-400">{l.email}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {activeDossier ? (
                        <StatusPill tone="success">en formation</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">pas de dossier actif</StatusPill>
                      )}
                      {l.rqth && (
                        <StatusPill tone="info">
                          <Accessibility className="w-3 h-3 -ml-0.5" />
                          RQTH
                        </StatusPill>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Link
                        href={`/apprenants/${l.id}`}
                        aria-label={`Ouvrir la fiche — ${name}`}
                        title="Ouvrir la fiche"
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {isOwnerAdmin && !l.anonymized_at && (
                        <AnonymizeAction subject={{ kind: 'learner', id: l.id, lastName: l.last_name }} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
