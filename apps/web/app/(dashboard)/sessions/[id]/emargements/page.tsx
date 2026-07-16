import { notFound } from 'next/navigation';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };
const SHEET_TONE: Record<string, 'info' | 'success' | 'neutral' | 'danger'> = {
  open: 'info',
  partial: 'info',
  completed: 'success',
  finalized: 'success',
};
const SHEET_LABEL: Record<string, string> = {
  open: 'Ouverte',
  partial: 'Partielle',
  completed: 'Complète',
  finalized: 'Finalisée',
};

export default async function SessionAttendanceTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { sheets } = loaded;

  if (sheets.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
        <EmptyState
          icon={ClipboardCheck}
          title="Aucune feuille d'émargement"
          description="Les feuilles (matin / après-midi) sont générées automatiquement à partir des horaires de la session."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Une journée = une session, mais deux feuilles d'émargement (matin et après-midi). Une pause déjeuner ne crée pas de nouvelle session.
      </p>
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {sheets.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">{HALF_DAY[s.half_day] ?? s.half_day}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                {s.signed}/{s.total} signés
              </span>
              {s.finalized_at && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              <StatusPill tone={SHEET_TONE[s.status] ?? 'neutral'}>{SHEET_LABEL[s.status] ?? s.status}</StatusPill>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
