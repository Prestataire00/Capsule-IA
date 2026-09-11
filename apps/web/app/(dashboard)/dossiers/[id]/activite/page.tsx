// ARCHETYPE: command
// Justification: timeline d'activité du dossier — historique des changements de statut (F-CRM-10).

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { History, ArrowRight } from 'lucide-react';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';

export default async function ActivitePage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('dossier_status_history')
    .select('id, from_status, to_status, reason, occurred_at')
    .eq('dossier_id', params.id)
    .order('occurred_at', { ascending: false })
    .limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
          <History className="w-4 h-4" />
        </span>
        <SectionLabel>Activité du dossier</SectionLabel>
        {rows.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.blue.soft}`}>{rows.length}</span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState icon={History} title="Aucune activité enregistrée pour l'instant." />
        </div>
      ) : (
        <ol className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {rows.map((e) => (
            <li key={e.id} className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {e.from_status && (
                  <>
                    <span className="text-[13px] text-zinc-500 dark:text-zinc-400">{dossierStatusLabel(e.from_status)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                  </>
                )}
                <StatusPill tone={dossierStatusTone(e.to_status)}>{dossierStatusLabel(e.to_status)}</StatusPill>
                {e.reason && <span className="text-[12px] text-zinc-500 dark:text-zinc-400">· {e.reason}</span>}
              </div>
              <span className="text-[12px] font-semibold text-blue-700 dark:text-blue-300 tabular-nums">{new Date(e.occurred_at).toLocaleString('fr-FR')}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
