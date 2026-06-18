// ARCHETYPE: command
// Justification: pipeline réel des dossiers — recherche + filtres statut, RLS-scopé (chaque formateur voit ses dossiers).

import Link from 'next/link';
import { Plus, Search, FolderOpen } from 'lucide-react';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ManageOnly } from '@/shared/components/auth/manage-only';

const STATUSES = ['draft', 'pending_validation', 'scheduled', 'active', 'completed', 'closed', 'archived', 'cancelled'] as const;

type SearchParams = { q?: string; status?: string | string[] };

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

export default async function DossiersPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim();
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
  if (statuses.length) query = query.in('status', statuses);
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

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-10">
      <header className="flex items-end justify-between mb-8">
        <div>
          <SectionLabel className="mb-2">Tous les dossiers</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Dossiers</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </p>
        </div>
        <ManageOnly section="dossiers">
        <Link
          href="/dossiers/nouveau"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau dossier
        </Link>
        </ManageOnly>
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

        <div className="ml-auto flex items-center gap-1 text-[11px] flex-wrap">
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
            title="Aucun dossier ne correspond."
            description="Élargissez la recherche ou réinitialisez les filtres."
            action={
              <Link
                href="/dossiers"
                className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
              >
                Réinitialiser
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_140px_1fr_120px_110px_100px] gap-3 py-2.5 px-4 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
            <div>Réf.</div>
            <div>Apprenant</div>
            <div>Entreprise</div>
            <div>Formation</div>
            <div>Période</div>
            <div className="text-right">Montant</div>
            <div>Statut</div>
          </div>
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {filtered.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dossiers/${d.id}`}
                  className="grid grid-cols-[110px_1fr_140px_1fr_120px_110px_100px] gap-3 py-3 px-4 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition items-center"
                >
                  <div><IdPill>{d.reference}</IdPill></div>
                  <div className="text-zinc-900 dark:text-zinc-100 truncate">
                    {[d.learner?.first_name, d.learner?.last_name].filter(Boolean).join(' ') || '—'}
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400 truncate">{d.company?.name ?? '—'}</div>
                  <div className="text-zinc-700 dark:text-zinc-300 truncate">{d.formation?.title ?? '—'}</div>
                  <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {fmtDate(d.start_date)} → {fmtDate(d.end_date)}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums">
                    {fmtEuros(d.total_amount_cents)}
                  </div>
                  <div><StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill></div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
