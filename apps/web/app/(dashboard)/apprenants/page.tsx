// ARCHETYPE: command
// Justification: vue carnet apprenants — KPIs, search, grille de cards avec avatars colorés et infos clés.

import Link from 'next/link';
import { Plus, Search, Users, Accessibility, GraduationCap, TrendingUp, Mail, Phone, ArrowUpRight } from 'lucide-react';
import { learners, companies, dossiers } from '@/shared/mock/data';
import { StatCard } from '@/shared/ui/stat-card';

const palette = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
];

type FilterKey = 'all' | 'in_formation' | 'rqth' | 'no_company';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'in_formation', label: 'En formation' },
  { key: 'rqth', label: 'RQTH' },
  { key: 'no_company', label: 'Sans entreprise' },
];

export default function ApprenantsPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const inFormationIds = new Set(
    dossiers
      .filter((d) => d.status === 'active' || d.status === 'scheduled')
      .map((d) => d.learnerId),
  );
  const inFormation = Array.from(inFormationIds);
  const rqthCount = learners.filter((l) => l.rqth).length;
  const newThisMonth = 2; // mock

  const q = (searchParams.q ?? '').trim().toLowerCase();
  const activeFilter: FilterKey =
    FILTERS.some((f) => f.key === searchParams.filter)
      ? (searchParams.filter as FilterKey)
      : 'all';

  const filteredLearners = learners.filter((l) => {
    if (activeFilter === 'in_formation' && !inFormationIds.has(l.id)) return false;
    if (activeFilter === 'rqth' && !l.rqth) return false;
    if (activeFilter === 'no_company' && l.companyId) return false;
    if (q) {
      const company = companies.find((c) => c.id === l.companyId);
      const haystack = `${l.firstName} ${l.lastName} ${l.email} ${l.position ?? ''} ${company?.name ?? ''}`.toLowerCase();
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
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Apprenants</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {learners.length} apprenants suivis dans votre OF.
          </p>
        </div>
        <Link
          href="/apprenants/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvel apprenant
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total apprenants" value={learners.length} icon={Users} accent="rose" hint="dans le carnet" hintTone="neutral" />
        <StatCard label="En formation" value={inFormation.length} icon={GraduationCap} accent="violet" hint="dossiers actifs/planifiés" hintTone="neutral" />
        <StatCard label="RQTH" value={rqthCount} icon={Accessibility} accent="blue" hint="adaptations à prévoir" hintTone="neutral" />
        <StatCard label="Nouveaux ce mois" value={newThisMonth} icon={TrendingUp} accent="emerald" hint="↑ 1 vs mois dernier" hintTone="success" />
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
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </form>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-2">Filtre :</span>
          {FILTERS.map((f) => {
            const active = f.key === activeFilter;
            return (
              <Link
                key={f.key}
                href={filterHref(f.key)}
                className={
                  active
                    ? 'bg-violet-600 text-white px-2.5 py-1 rounded-md font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition'
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {(q || activeFilter !== 'all') && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 px-1">
          {filteredLearners.length === 0
            ? 'Aucun apprenant ne correspond.'
            : `${filteredLearners.length} apprenant${filteredLearners.length > 1 ? 's' : ''} sur ${learners.length}`}
          {(q || activeFilter !== 'all') && (
            <>
              {' · '}
              <Link href="/apprenants" className="text-violet-600 dark:text-violet-400 hover:underline">
                Réinitialiser
              </Link>
            </>
          )}
        </p>
      )}

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLearners.map((l) => {
          const initials = `${l.firstName[0]}${l.lastName[0]}`.toUpperCase();
          const idx = (l.firstName.charCodeAt(0) + l.lastName.charCodeAt(0)) % palette.length;
          const company = companies.find((c) => c.id === l.companyId);
          const activeDossier = dossiers.find((d) => d.learnerId === l.id && (d.status === 'active' || d.status === 'scheduled'));
          return (
            <li key={l.id}>
              <Link
                href="#"
                className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-medium flex-shrink-0 shadow-sm ${palette[idx]}`}>
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {l.firstName} {l.lastName}
                      </p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                        {l.position}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{l.email}</span>
                  </div>
                  {company && (
                    <div className="flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                      <Phone className="w-3 h-3 flex-shrink-0 invisible" />
                      <span className="truncate">{company.name}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeDossier && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      en formation
                    </span>
                  )}
                  {!activeDossier && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      pas de dossier actif
                    </span>
                  )}
                  {l.rqth && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 inline-flex items-center gap-1">
                      <Accessibility className="w-2.5 h-2.5" />
                      RQTH
                    </span>
                  )}
                  {!l.companyId && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      indép.
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
