// ARCHETYPE: command
// Justification: recherche transversale unifiée (entreprises, apprenants, dossiers) — F-CRM-09.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { Search, Eye, Building2, User, FolderOpen } from 'lucide-react';
import { ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';

type SearchParams = { q?: string };

const LIST = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/80';

function GroupTitle({ icon: Icon, accent, label, count }: { icon: ComponentType<{ className?: string }>; accent: Accent; label: string; count: number }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
      <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS[accent].soft}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      {label}
      <span className={`normal-case tracking-normal text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS[accent].soft}`}>{count}</span>
    </h2>
  );
}

function RowIcon({ icon: Icon, accent }: { icon: ComponentType<{ className?: string }>; accent: Accent }) {
  return (
    <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS[accent].soft}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

export default async function RecherchePage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim();
  const sb = supabaseServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let companies: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let learners: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dossiers: any[] = [];

  if (q.length >= 2) {
    const like = `%${q}%`;
    const [c, l, d] = await Promise.all([
      sb.schema('app').from('companies').select('id, name, siret').is('deleted_at', null)
        .or(`name.ilike.${like},siret.ilike.${like}`).limit(20),
      sb.schema('app').from('learners').select('id, first_name, last_name, email').is('deleted_at', null)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`).limit(20),
      sb.schema('app').from('dossiers').select('id, reference, status').is('deleted_at', null)
        .ilike('reference', like).limit(20),
    ]);
    companies = c.data ?? [];
    learners = l.data ?? [];
    dossiers = d.data ?? [];
  }

  const total = companies.length + learners.length + dossiers.length;

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-9 space-y-6">
      <header>
        <SectionLabel className="mb-2">Pilotage</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Recherche</h1>
        {q.length >= 2 && (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
            {total} résultat{total > 1 ? 's' : ''} pour « {q} »
          </p>
        )}
        <form action="/recherche" method="get" className="relative mt-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-500" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Entreprise, apprenant, référence de dossier…"
            className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
        </form>
      </header>

      {q.length < 2 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Saisissez au moins 2 caractères.</p>
      ) : total === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun résultat pour « {q} ».</p>
      ) : (
        <div className="space-y-6">
          {companies.length > 0 && (
            <section>
              <GroupTitle icon={Building2} accent="teal" label="Entreprises" count={companies.length} />
              <ul className={LIST}>
                {companies.map((c) => (
                  <li key={c.id} className="px-5 py-3.5 text-[13px] flex items-center gap-3">
                    <RowIcon icon={Building2} accent="teal" />
                    <span className="flex-1 min-w-0 text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{c.name}</span>
                    {c.siret && <span className="font-mono text-[12px] text-zinc-500 dark:text-zinc-400">{c.siret}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {learners.length > 0 && (
            <section>
              <GroupTitle icon={User} accent="rose" label="Apprenants" count={learners.length} />
              <ul className={LIST}>
                {learners.map((l) => (
                  <li key={l.id} className="px-5 py-3.5 text-[13px] flex items-center gap-3">
                    <RowIcon icon={User} accent="rose" />
                    <span className="flex-1 min-w-0 text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {[l.first_name, l.last_name].filter(Boolean).join(' ')}
                    </span>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{l.email}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dossiers.length > 0 && (
            <section>
              <GroupTitle icon={FolderOpen} accent="orange" label="Dossiers" count={dossiers.length} />
              <ul className={LIST}>
                {dossiers.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dossiers/${d.id}`}
                      className="px-5 py-3.5 text-[13px] flex items-center gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group"
                    >
                      <RowIcon icon={FolderOpen} accent="orange" />
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">{d.reference}</span>
                      <span className="ml-auto">
                        <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                      </span>
                      <span
                        aria-hidden="true"
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 group-hover:bg-orange-50 group-hover:text-orange-600 dark:group-hover:bg-orange-950/40 dark:group-hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
