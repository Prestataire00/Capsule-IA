// ARCHETYPE: command
// Justification: catalogue des modules en données réelles — édition inline du prix (F-CRM-03).

import { BookOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { ModulePriceCell } from './module-price-cell';

type ModuleRow = {
  id: string;
  code: string | null;
  title: string;
  default_duration_hours: number | null;
  price_cents: number | null;
};

export default async function ModulesPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('modules')
    .select('id, code, title, default_duration_hours, price_cents')
    .is('deleted_at', null)
    .order('title', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modules = ((data as any[]) ?? []) as ModuleRow[];

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-10">
      <header className="mb-8">
        <SectionLabel className="mb-2">Catalogue</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Modules</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {modules.length} module{modules.length > 1 ? 's' : ''} · le prix se modifie directement dans la liste (HT, par module).
        </p>
      </header>

      {modules.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState
            icon={BookOpen}
            title="Aucun module dans le catalogue."
            description="Les modules apparaissent ici une fois créés dans vos formations."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_90px_160px] gap-3 py-2.5 px-4 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
            <div>Code</div>
            <div>Intitulé</div>
            <div className="text-right">Durée</div>
            <div className="text-right">Prix HT</div>
          </div>
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {modules.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[110px_1fr_90px_160px] gap-3 py-2.5 px-4 text-[13px] items-center"
              >
                <div className="font-mono text-[11px] text-zinc-400">{m.code ?? '—'}</div>
                <div className="text-zinc-900 dark:text-zinc-100 truncate">{m.title}</div>
                <div className="text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {m.default_duration_hours != null ? `${Number(m.default_duration_hours)} h` : '—'}
                </div>
                <div>
                  <ModulePriceCell moduleId={m.id} priceCents={m.price_cents} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
