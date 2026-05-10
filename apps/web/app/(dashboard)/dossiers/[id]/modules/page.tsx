// ARCHETYPE: command
// Justification: liste des modules du dossier — édition par ligne, total horaire, ajout au header.

import { notFound } from 'next/navigation';
import { Plus, GripVertical, X } from 'lucide-react';
import { dossiers, modulesByDossier } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';

export default function ModulesPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const modules = modulesByDossier[params.id] ?? [];
  const totalHours = modules.reduce((acc, m) => acc + m.durationHours, 0);

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel className="mb-1">Modules</SectionLabel>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {modules.length} module{modules.length > 1 ? 's' : ''} ·{' '}
            <span className="font-mono">{totalHours} h</span>
            {totalHours !== dossier.totalHours && (
              <span className="text-amber-600 dark:text-amber-500"> · {totalHours < dossier.totalHours ? '−' : '+'}{Math.abs(dossier.totalHours - totalHours)} h vs total dossier</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un module
        </button>
      </header>

      {modules.length === 0 ? (
        <div className="border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-md py-12 text-center">
          <p className="text-[13px] text-zinc-500">Aucun module dans ce dossier.</p>
        </div>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {modules.map((m) => (
            <li key={m.id} className="grid grid-cols-[20px_40px_1fr_140px_80px_24px] gap-3 py-3 px-1 items-center text-[13px] group">
              <GripVertical className="w-4 h-4 text-zinc-300 dark:text-zinc-600 cursor-grab" />
              <span className="font-mono text-[11px] text-zinc-400">{m.position + 1}.</span>
              <span className="text-zinc-900 dark:text-zinc-100">{m.title}</span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {m.startDate ? `${m.startDate.slice(8, 10)}/${m.startDate.slice(5, 7)} → ${m.endDate?.slice(8, 10)}/${m.endDate?.slice(5, 7)}` : '—'}
              </span>
              <span className="font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100 text-right">{m.durationHours} h</span>
              <button
                type="button"
                aria-label="Retirer le module"
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
