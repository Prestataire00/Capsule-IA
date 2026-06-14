// ARCHETYPE: command
// Justification: recherche transversale unifiée (entreprises, apprenants, dossiers) — F-CRM-09.

import Link from 'next/link';
import { Search } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';

type SearchParams = { q?: string };

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
    <div className="max-w-3xl w-full mx-auto px-8 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recherche</h1>
        <form action="/recherche" method="get" className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Entreprise, apprenant, référence de dossier…"
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md pl-9 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </form>
      </header>

      {q.length < 2 ? (
        <p className="text-[13px] text-zinc-500">Saisissez au moins 2 caractères.</p>
      ) : total === 0 ? (
        <p className="text-[13px] text-zinc-500">Aucun résultat pour « {q} ».</p>
      ) : (
        <div className="space-y-6">
          {companies.length > 0 && (
            <section>
              <SectionLabel className="mb-2">Entreprises ({companies.length})</SectionLabel>
              <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
                {companies.map((c) => (
                  <li key={c.id} className="py-2.5 px-1 text-[13px] flex items-center justify-between">
                    <span>{c.name}</span>
                    {c.siret && <span className="font-mono text-[11px] text-zinc-400">{c.siret}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {learners.length > 0 && (
            <section>
              <SectionLabel className="mb-2">Apprenants ({learners.length})</SectionLabel>
              <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
                {learners.map((l) => (
                  <li key={l.id} className="py-2.5 px-1 text-[13px] flex items-center justify-between">
                    <span>{[l.first_name, l.last_name].filter(Boolean).join(' ')}</span>
                    <span className="text-[11px] text-zinc-400">{l.email}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dossiers.length > 0 && (
            <section>
              <SectionLabel className="mb-2">Dossiers ({dossiers.length})</SectionLabel>
              <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
                {dossiers.map((d) => (
                  <li key={d.id} className="py-2.5 px-1 text-[13px]">
                    <Link href={`/dossiers/${d.id}`} className="flex items-center justify-between hover:underline">
                      <span className="font-mono">{d.reference}</span>
                      <span className="text-[11px] text-zinc-400">{d.status}</span>
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
