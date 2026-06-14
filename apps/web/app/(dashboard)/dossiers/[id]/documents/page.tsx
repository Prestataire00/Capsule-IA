// ARCHETYPE: command
// Justification: liste réelle des documents du dossier avec statut.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('documents')
    .select('id, title, kind, status, created_at')
    .eq('dossier_id', params.id)
    .order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <SectionLabel>Documents ({rows.length})</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Aucun document généré pour ce dossier.</p>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {rows.map((d) => (
            <li key={d.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
              <span className="truncate">{d.title}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-zinc-400">{d.kind}</span>
                <StatusPill tone={d.status === 'ready' ? 'success' : 'neutral'}>{d.status}</StatusPill>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
