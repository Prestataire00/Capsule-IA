// ARCHETYPE: command
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { trainers } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export default function FormateursPage() {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Gestion</SectionLabel>
          <h1 className="text-2xl font-medium">Formateurs</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{trainers.length} formateurs</p>
        </div>
        <Link
          href="#"
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau formateur
        </Link>
      </header>
      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {trainers.map((t) => (
          <li key={t.id} className="grid grid-cols-[1fr_1fr_1fr_100px] gap-3 py-3 px-1 items-center text-[13px]">
            <span className="text-zinc-900 dark:text-zinc-100">{t.firstName} {t.lastName}</span>
            <span className="font-mono text-[11px] text-zinc-500">{t.email}</span>
            <span className="text-zinc-500 dark:text-zinc-400 truncate">{t.specialties.join(' · ')}</span>
            <StatusPill tone="neutral">{t.isInternal ? 'interne' : 'externe'}</StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
