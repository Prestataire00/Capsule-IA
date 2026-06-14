// ARCHETYPE: command
// Justification: conformité Qualiopi réelle par indicateur + actions de transition gardées.

import { notFound } from 'next/navigation';
import { Check, X, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import { startTraining, closeDossier, recomputeNow } from './actions';

type DetailRow = {
  indicator_id: string;
  number: number;
  stage: 'entry' | 'closing' | 'none';
  is_blocking: boolean;
  satisfied: boolean;
  source: string;
};

export default async function QualiopiPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier } = await sb
    .schema('app').from('dossiers')
    .select('id, status').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();
  const status = (dossier as { status: string }).status;

  // Prod-safe : si les colonnes/tables ne sont pas encore migrées, data=null → section vide.
  const { data: checklist } = await sb
    .schema('app').from('qualiopi_dossier_checklists')
    .select('total_indicators, satisfied_indicators, entry_blocking_missing, closing_blocking_missing, details')
    .eq('dossier_id', params.id).maybeSingle();

  const { data: indicators } = await sb
    .schema('app').from('qualiopi_indicators')
    .select('code, number, title, criterion').eq('scope', 'dossier');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (checklist as any) ?? {};
  const details: DetailRow[] = c.details ?? [];
  const entryBlockingMissing: number = c.entry_blocking_missing ?? 0;
  const closingBlockingMissing: number = c.closing_blocking_missing ?? 0;
  const refByNumber = new Map<number, { code: string; title: string; criterion: number }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((indicators as any[]) ?? []).map((i) => [i.number, { code: i.code, title: i.title, criterion: i.criterion }]),
  );

  const enriched = details.map((d) => {
    const ref = refByNumber.get(d.number);
    return {
      code: ref?.code ?? `#${d.number}`,
      title: ref?.title ?? `Indicateur ${d.number}`,
      criterion: ref?.criterion ?? 0,
      number: d.number,
      satisfied: d.satisfied,
      blocking: d.is_blocking,
      stage: d.stage,
    };
  });

  const byCriterion = enriched.reduce<Record<number, typeof enriched>>((acc, e) => {
    (acc[e.criterion] ||= []).push(e);
    return acc;
  }, {});

  const entryBlockers = enriched.filter((e) => e.stage === 'entry' && e.blocking && !e.satisfied);
  const closingBlockers = enriched.filter((e) => e.stage === 'closing' && e.blocking && !e.satisfied);
  const satisfied = c.satisfied_indicators ?? enriched.filter((e) => e.satisfied).length;
  const totalCount = c.total_indicators ?? enriched.length;
  const ready = entryBlockingMissing === 0 && closingBlockingMissing === 0;

  return (
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-2">Conformité Qualiopi</SectionLabel>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-4 py-3 flex items-center gap-4">
          {ready ? (
            <ShieldCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-[15px] font-medium">{satisfied} / {totalCount} indicateurs satisfaits</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {details.length === 0
                ? 'Checklist pas encore calculée — cliquez sur Recalculer.'
                : ready
                  ? 'Tous les indicateurs bloquants sont satisfaits.'
                  : `${entryBlockers.length} bloquant(s) d'entrée, ${closingBlockers.length} bloquant(s) de clôture.`}
            </p>
          </div>
          <form action={async () => { 'use server'; await recomputeNow(params.id); }}>
            <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">
              Recalculer
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <form action={async () => { 'use server'; await startTraining(params.id); }}>
          <button
            type="submit"
            disabled={status === 'active' || entryBlockingMissing > 0}
            className="border border-zinc-200/60 dark:border-zinc-800 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title={entryBlockingMissing > 0 ? `${entryBlockingMissing} indicateur(s) d'entrée bloquant(s)` : ''}
          >
            Démarrer la formation
          </button>
        </form>
        <form action={async () => { 'use server'; await closeDossier(params.id); }}>
          <button
            type="submit"
            disabled={status === 'closed' || closingBlockingMissing > 0}
            className="border border-zinc-200/60 dark:border-zinc-800 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title={closingBlockingMissing > 0 ? `${closingBlockingMissing} indicateur(s) de clôture bloquant(s)` : ''}
          >
            Clôturer le dossier
          </button>
        </form>
      </div>

      {(entryBlockers.length > 0 || closingBlockers.length > 0) && (
        <InfoCallout tone="warning">
          <p className="font-medium">Indicateurs bloquants à résoudre</p>
          <ul className="text-[11px] mt-2 space-y-1">
            {[...entryBlockers, ...closingBlockers].map((b) => (
              <li key={b.code} className="flex items-center gap-2">
                <span className="font-mono text-amber-700 dark:text-amber-300">{b.code}</span>
                <span>{b.title}</span>
                <span className="text-amber-600/70">({b.stage === 'entry' ? 'entrée' : 'clôture'})</span>
              </li>
            ))}
          </ul>
        </InfoCallout>
      )}

      {Object.entries(byCriterion).map(([criterion, items]) => {
        const okCount = items.filter((i) => i.satisfied).length;
        return (
          <section key={criterion}>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>Critère {criterion}</SectionLabel>
              <span className="font-mono text-[11px] text-zinc-500">{okCount}/{items.length}</span>
            </div>
            <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {items.map((ind) => (
                <li key={ind.code} className="grid grid-cols-[40px_60px_1fr_120px] gap-3 py-3 px-1 items-center text-[13px]">
                  {ind.satisfied ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-zinc-500">{ind.code}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{ind.title}</span>
                  {ind.blocking && !ind.satisfied ? (
                    <StatusPill tone="warning">bloquant</StatusPill>
                  ) : (
                    <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1 justify-self-end">
                      {ind.stage !== 'none' ? (ind.stage === 'entry' ? 'entrée' : 'clôture') : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
