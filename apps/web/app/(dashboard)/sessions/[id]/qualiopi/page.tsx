import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

type Checklist = {
  dossier_id: string;
  total_indicators: number;
  satisfied_indicators: number;
  blocking_missing: number;
  is_ready: boolean;
};

export default async function SessionQualiopiTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { dossierIds, learners } = loaded;
  const learnerByDossier = new Map(learners.map((l) => [l.dossierId, l]));

  let checklists: Checklist[] = [];
  if (dossierIds.length) {
    const { data } = await sb
      .schema('app')
      .from('qualiopi_dossier_checklists' as never)
      .select('dossier_id, total_indicators, satisfied_indicators, blocking_missing, is_ready')
      .in('dossier_id', dossierIds);
    checklists = (data as unknown as Checklist[] | null) ?? [];
  }

  if (checklists.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
        <EmptyState
          icon={ShieldCheck}
          title="Qualiopi non calculé"
          description="Les indicateurs Qualiopi sont calculés par dossier (émargement, questionnaires, preuves). L'agrégat de la session apparaîtra une fois les dossiers évalués."
        />
      </div>
    );
  }

  const ready = checklists.filter((c) => c.is_ready).length;

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Conformité Qualiopi agrégée depuis les dossiers de la session (alimentée par les émargements et questionnaires).
      </p>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 inline-block min-w-[200px]">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 mb-3">Dossiers conformes</p>
        <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{ready}/{checklists.length}</p>
      </div>
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
        {checklists.map((c) => {
          const l = learnerByDossier.get(c.dossier_id);
          return (
            <li key={c.dossier_id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
              <Link
                href={`/dossiers/${c.dossier_id}/qualiopi`}
                className={`hover:text-orange-600 dark:hover:text-orange-300 ${l ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'font-mono text-zinc-700 dark:text-zinc-300'}`}
              >
                {l ? `${l.first_name} ${l.last_name}` : c.dossier_id.slice(0, 8)}
              </Link>
              <span className="flex items-center gap-2 text-[12px]">
                <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">{c.satisfied_indicators}/{c.total_indicators}</span>
                {c.is_ready ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 tabular-nums">
                    <AlertTriangle className="w-4 h-4" /> {c.blocking_missing}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
