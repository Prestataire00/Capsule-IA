'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TEMPLATE_VARIABLES } from '@/features/documents/templates/variables';

const GROUP_COLORS: Record<string, string> = {
  Apprenant: 'bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
  Entreprise: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  Formation: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  Dossier: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  Formateur: 'bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  Organisme: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  Conditions: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',
  Divers: 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

const groupColor = (g: string) => GROUP_COLORS[g] ?? GROUP_COLORS.Divers;

export function VariablesSidePanel({ onInsert }: { onInsert: (slug: string) => void }) {
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = [...new Set(TEMPLATE_VARIABLES.map((v) => v.group))];
    return groups
      .map((g) => ({
        group: g,
        items: TEMPLATE_VARIABLES.filter(
          (v) =>
            v.group === g &&
            (!q || v.label.toLowerCase().includes(q) || v.slug.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [search]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une variable…"
          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md pl-8 pr-3 py-1.5 text-[12px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
        />
      </div>
      <div className="space-y-4 overflow-y-auto pr-1">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              {group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((v) => (
                <button
                  key={v.slug}
                  type="button"
                  onClick={() => onInsert(v.slug)}
                  title={`{${v.slug}}`}
                  className={`text-[11px] font-medium border rounded-md px-2 py-1 transition ${groupColor(group)}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-[12px] text-zinc-400">Aucune variable ne correspond.</p>
        )}
      </div>
    </div>
  );
}
