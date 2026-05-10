// ARCHETYPE: command
// Justification: liste de gestion des apprenants — densité, recherche, table plate.

import Link from 'next/link';
import { Plus, Accessibility } from 'lucide-react';
import { learners, companyName } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';

export default function ApprenantsPage() {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Gestion</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Apprenants</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {learners.length} apprenant{learners.length > 1 ? 's' : ''} actif{learners.length > 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="#"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvel apprenant
        </Link>
      </header>

      <div className="border-y border-zinc-200/60 dark:border-zinc-800">
        <div className="grid grid-cols-[1fr_1fr_180px_120px_60px] gap-3 py-2 px-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800">
          <div>Nom</div>
          <div>Email</div>
          <div>Entreprise</div>
          <div>Poste</div>
          <div>Spécif.</div>
        </div>
        <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {learners.map((l) => (
            <li key={l.id}>
              <Link
                href="#"
                className="grid grid-cols-[1fr_1fr_180px_120px_60px] gap-3 py-2.5 px-1 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition items-center"
              >
                <div className="flex items-center gap-2">
                  <IdPill>{l.id}</IdPill>
                  <span className="text-zinc-900 dark:text-zinc-100">{l.firstName} {l.lastName}</span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 truncate">{l.email}</div>
                <div className="text-zinc-700 dark:text-zinc-300 truncate">{companyName(l.companyId) ?? '—'}</div>
                <div className="text-zinc-500 dark:text-zinc-400 truncate">{l.position}</div>
                <div>
                  {l.rqth && (
                    <Accessibility className="w-3.5 h-3.5 text-blue-600" aria-label="RQTH" />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
