// ARCHETYPE: command
// Justification: liste réelle des modules du dossier (volume horaire + prix figé).

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export default async function ModulesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('dossier_modules')
    .select('id, position, title_snapshot, duration_hours, price_cents')
    .eq('dossier_id', params.id)
    .order('position', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]) ?? [];
  const totalHours = rows.reduce((s, m) => s + Number(m.duration_hours ?? 0), 0);
  const pricedRows = rows.filter((m) => m.price_cents != null);
  const totalCents = pricedRows.reduce((s, m) => s + Number(m.price_cents), 0);
  const hasAnyPrice = pricedRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Modules ({rows.length})</SectionLabel>
        <span className="text-[12px] text-zinc-500">
          {totalHours} h au total
          {hasAnyPrice && <> · {formatEuros(totalCents)} HT</>}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Aucun module rattaché à ce dossier.</p>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {rows.map((m) => (
            <li key={m.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{m.position + 1}. {m.title_snapshot}</span>
              <span className="flex items-center gap-4 flex-shrink-0">
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{Number(m.duration_hours)} h</span>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums w-20 text-right">
                  {formatEuros(m.price_cents ?? null)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasAnyPrice && pricedRows.length < rows.length && (
        <p className="text-[11px] text-zinc-400">
          Sous-total calculé sur {pricedRows.length}/{rows.length} module{rows.length > 1 ? 's' : ''} tarifé{pricedRows.length > 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
}
