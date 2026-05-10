// ARCHETYPE: command
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { formations } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';

export default function FormationsPage() {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Catalogue</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Formations</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {formations.length} formations · {formations.filter((f) => f.isPublished).length} publiées
          </p>
        </div>
        <Link
          href="#"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle formation
        </Link>
      </header>
      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {formations.map((f) => (
          <li key={f.id} className="grid grid-cols-[100px_1fr_120px_100px_120px] gap-3 py-3 px-1 items-center text-[13px]">
            <IdPill>{f.code}</IdPill>
            <span className="text-zinc-900 dark:text-zinc-100">{f.title}</span>
            <span className="text-zinc-500 dark:text-zinc-400 capitalize">{f.modality}</span>
            <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{f.defaultHours} h</span>
            <StatusPill tone={f.isPublished ? 'success' : 'neutral'}>
              {f.isPublished ? 'publiée' : 'brouillon'}
            </StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
