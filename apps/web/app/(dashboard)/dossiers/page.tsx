// ARCHETYPE: command
// Justification: liste de gestion plus aérée — header chaleureux, filtres lisibles, lignes confortables.

import Link from 'next/link';
import { Plus, X, Search, FolderOpen } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';

import { dossiers, learnerFullName, formationTitle, companyName, formatEuros } from '@/shared/mock/data';

const STATUSES = ['draft', 'pending_validation', 'scheduled', 'active', 'completed', 'closed', 'archived', 'cancelled'] as const;

type SearchParams = { q?: string; status?: string | string[] };

export default function DossiersPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').toLowerCase();
  const statuses = Array.isArray(searchParams.status) ? searchParams.status : searchParams.status ? [searchParams.status] : [];

  const filtered = dossiers.filter((d) => {
    if (statuses.length && !statuses.includes(d.status)) return false;
    if (q) {
      const hay = `${d.reference} ${learnerFullName(d.learnerId)} ${formationTitle(d.formationId)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-10">
      <header className="flex items-end justify-between mb-8">
        <div>
          <SectionLabel className="mb-2">Tous les dossiers</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Dossiers</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            {filtered.length !== dossiers.length && (
              <span className="text-zinc-400"> · sur {dossiers.length} au total</span>
            )}
          </p>
        </div>
        <Link
          href="/dossiers/nouveau"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau dossier
        </Link>
      </header>

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <form action="/dossiers" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une référence, un apprenant…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
          {statuses.map((s) => (
            <input key={s} type="hidden" name="status" value={s} />
          ))}
        </form>

        {statuses.map((s) => {
          const remaining = statuses.filter((x) => x !== s);
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          remaining.forEach((r) => params.append('status', r));
          return (
            <Link
              key={s}
              href={`/dossiers?${params.toString()}`}
              className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
            >
              {dossierStatusLabel(s)}
              <X className="w-3 h-3" />
            </Link>
          );
        })}

        <div className="ml-auto flex items-center gap-1 text-[11px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-1">Filtrer:</span>
          {STATUSES.map((s) => {
            const isOn = statuses.includes(s);
            const next = isOn ? statuses.filter((x) => x !== s) : [...statuses, s];
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            next.forEach((r) => params.append('status', r));
            return (
              <Link
                key={s}
                href={`/dossiers?${params.toString()}`}
                className={
                  isOn
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 rounded-md transition'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition'
                }
              >
                {dossierStatusLabel(s)}
              </Link>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState
            icon={FolderOpen}
            title="Aucun dossier ne correspond à vos filtres."
            description="Essayez d'élargir la recherche, ou réinitialisez les filtres pour voir tout."
            action={
              <Link
                href="/dossiers"
                className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
              >
                Réinitialiser les filtres
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_100px] gap-3 py-2.5 px-4 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
            <div>Réf.</div>
            <div>Apprenant</div>
            <div>Entreprise</div>
            <div>Formation</div>
            <div>Période</div>
            <div className="text-right">Montant</div>
            <div>Qualiopi</div>
            <div>Statut</div>
          </div>
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {filtered.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dossiers/${d.id}`}
                  className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_100px] gap-3 py-3 px-4 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition items-center"
                >
                  <div><IdPill>{d.reference}</IdPill></div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={learnerFullName(d.learnerId)} />
                    <span className="text-zinc-900 dark:text-zinc-100 truncate">{learnerFullName(d.learnerId)}</span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400 truncate">{companyName(d.companyId) ?? '—'}</div>
                  <div className="text-zinc-700 dark:text-zinc-300 truncate">{formationTitle(d.formationId)}</div>
                  <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {format(parseISO(d.startDate), 'dd/MM/yy')} → {format(parseISO(d.endDate), 'dd/MM/yy')}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums">
                    {formatEuros(d.totalAmountCents)}
                  </div>
                  <div>
                    <span className={
                      d.qualiopiBlocking > 0
                        ? 'text-[11px] text-amber-600 dark:text-amber-500 font-mono'
                        : d.qualiopiReady
                        ? 'text-[11px] text-emerald-600 dark:text-emerald-500 font-mono'
                        : 'text-[11px] text-zinc-500 dark:text-zinc-400 font-mono'
                    }>
                      {d.qualiopiSatisfied}/{d.qualiopiTotal}
                    </span>
                  </div>
                  <div>
                    <StatusPill tone={dossierStatusTone(d.status)}>
                      {dossierStatusLabel(d.status)}
                    </StatusPill>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const palette = ['bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
