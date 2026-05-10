// ARCHETYPE: command
// Justification: liste de gestion à haute densité, filtres URL state, table plate avec dividers, action principale au header.

import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { KeyboardFooter } from '@/shared/ui/keyboard-footer';

import {
  dossiers, learnerFullName, formationTitle, companyName, formatEuros,
} from '@/shared/mock/data';

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
    <div className="min-h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <header className="flex items-end justify-between mb-6">
          <div>
            <SectionLabel className="mb-1">Gestion</SectionLabel>
            <h1 className="text-2xl font-medium">Dossiers</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              {filtered.length !== dossiers.length && (
                <span className="text-zinc-400"> · sur {dossiers.length}</span>
              )}
            </p>
          </div>
          <Link
            href="/dossiers/nouveau"
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau dossier
          </Link>
        </header>

        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <form action="/dossiers" method="get" className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              name="q"
              defaultValue={searchParams.q}
              placeholder="Rechercher (réf., apprenant, formation)…"
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-1.5 text-[13px] w-72 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
            />
            {statuses.map((s) => (
              <input key={s} type="hidden" name="status" value={s} />
            ))}
          </form>

          {statuses.length > 0 && (
            <>
              <span className="text-[11px] text-zinc-400">Filtres:</span>
              {statuses.map((s) => {
                const remaining = statuses.filter((x) => x !== s);
                const params = new URLSearchParams();
                if (q) params.set('q', q);
                remaining.forEach((r) => params.append('status', r));
                return (
                  <Link
                    key={s}
                    href={`/dossiers?${params.toString()}`}
                    className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full px-2.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                  >
                    {dossierStatusLabel(s)}
                    <X className="w-3 h-3" />
                  </Link>
                );
              })}
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-400">Statut:</span>
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
                      ? 'text-[11px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-0.5 rounded transition'
                      : 'text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-0.5 rounded transition'
                  }
                >
                  {dossierStatusLabel(s)}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-y border-zinc-200/60 dark:border-zinc-800">
          <div className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_90px] gap-3 py-2 px-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800">
            <div>Réf.</div>
            <div>Apprenant</div>
            <div>Entreprise</div>
            <div>Formation</div>
            <div>Période</div>
            <div className="text-right">Montant</div>
            <div>Qualiopi</div>
            <div>Statut</div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-zinc-400">
              Aucun dossier ne correspond aux filtres.
              {statuses.length > 0 && (
                <Link href="/dossiers" className="block mt-2 text-zinc-700 dark:text-zinc-300 hover:underline">
                  Réinitialiser les filtres
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {filtered.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_90px] gap-3 py-2.5 px-1 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                  >
                    <div><IdPill>{d.reference}</IdPill></div>
                    <div className="text-zinc-900 dark:text-zinc-100 truncate">{learnerFullName(d.learnerId)}</div>
                    <div className="text-zinc-500 dark:text-zinc-400 truncate">{companyName(d.companyId) ?? '—'}</div>
                    <div className="text-zinc-700 dark:text-zinc-300 truncate">{formationTitle(d.formationId)}</div>
                    <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {format(parseISO(d.startDate), 'dd/MM/yy')} → {format(parseISO(d.endDate), 'dd/MM/yy')}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 text-right">
                      {formatEuros(d.totalAmountCents)}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {d.qualiopiSatisfied}/{d.qualiopiTotal}
                      {d.qualiopiBlocking > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-500">⚠</span>
                      )}
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
          )}
        </div>
      </div>

      <KeyboardFooter shortcuts="⌘K palette · ⌘N nouveau · ⌘F filtre · ↑↓ naviguer · ⏎ ouvrir" />
    </div>
  );
}
