// ARCHETYPE: command
// Justification: timeline d'activité du dossier — historique des changements de statut (F-CRM-10).

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { dossierStatusLabel } from '@/shared/ui/status-pill';

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
      <SectionLabel>Activité du dossier</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Aucune activité enregistrée pour l'instant.</p>
      ) : (
        <ol className="relative border-l border-zinc-200/60 dark:border-zinc-800 ml-2 space-y-4">
          {rows.map((e) => (
            <li key={e.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-orange-400" />
              <p className="text-[13px] text-zinc-900 dark:text-zinc-100">
                {e.from_status ? `${dossierStatusLabel(e.from_status)} → ` : ''}
                <strong>{dossierStatusLabel(e.to_status)}</strong>
              </p>
              <p className="text-[11px] text-zinc-500">
                {new Date(e.occurred_at).toLocaleString('fr-FR')}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
