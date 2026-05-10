// ARCHETYPE: command
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { companies, learners } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';

export default function EntreprisesPage() {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Gestion</SectionLabel>
          <h1 className="text-2xl font-medium">Entreprises</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{companies.length} entreprises</p>
        </div>
        <Link
          href="#"
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle entreprise
        </Link>
      </header>
      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {companies.map((c) => {
          const count = learners.filter((l) => l.companyId === c.id).length;
          return (
            <li key={c.id} className="grid grid-cols-[1fr_1fr_140px_120px_80px] gap-3 py-3 px-1 items-center text-[13px]">
              <div className="flex items-center gap-2">
                <IdPill>{c.id}</IdPill>
                <span className="text-zinc-900 dark:text-zinc-100">{c.name}</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">{c.email}</span>
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{c.siret}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{c.city}</span>
              <span className="font-mono text-[11px] text-zinc-500">{count} apprenant{count > 1 ? 's' : ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
