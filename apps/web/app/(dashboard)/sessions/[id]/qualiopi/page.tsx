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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3 inline-block">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">Dossiers conformes</p>
        <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{ready}/{checklists.length}</p>
      </div>
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800 text-[13px]">
        {checklists.map((c) => {
          const l = learnerByDossier.get(c.dossier_id);
          return (
            <li key={c.dossier_id} className="flex items-center justify-between px-4 py-2.5">
              <Link href={`/dossiers/${c.dossier_id}/qualiopi`} className="text-zinc-800 dark:text-zinc-200 hover:text-violet-600">
                {l ? `${l.first_name} ${l.last_name}` : c.dossier_id.slice(0, 8)}
              </Link>
              <span className="flex items-center gap-2 text-[12px]">
                <span className="text-zinc-500">{c.satisfied_indicators}/{c.total_indicators}</span>
                {c.is_ready ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
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
