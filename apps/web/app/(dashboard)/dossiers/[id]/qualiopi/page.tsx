// ARCHETYPE: command
// Justification: vue détaillée de la conformité Qualiopi par indicateur, avec actions de résolution.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Check, X, Paperclip, ShieldCheck, ShieldAlert } from 'lucide-react';
import { dossiers, qualiopiByDossier, qualiopiIndicators } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

export default function QualiopiPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const states = qualiopiByDossier[params.id] ?? [];
  const dossierIndicators = qualiopiIndicators.filter((i) => i.scope === 'dossier');

  const enriched = dossierIndicators.map((ind) => {
    const state = states.find((s) => s.code === ind.code);
    return {
      ...ind,
      satisfied: state?.satisfied ?? false,
      blocking: state?.blocking ?? false,
      proofs: state?.proofs ?? [],
    };
  });

  const byCriterion = enriched.reduce<Record<number, typeof enriched>>((acc, e) => {
    (acc[e.criterion] ||= []).push(e);
    return acc;
  }, {});

  const blockers = enriched.filter((e) => !e.satisfied && e.blocking);
  const ready = blockers.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-2">Préparation à la clôture</SectionLabel>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-4 py-3 flex items-center gap-4">
          {ready ? (
            <ShieldCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-[15px] font-medium">
              {dossier.qualiopiSatisfied} / {dossier.qualiopiTotal} indicateurs satisfaits
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {ready
                ? 'Tous les indicateurs bloquants sont satisfaits — vous pouvez clôturer.'
                : `${blockers.length} indicateur${blockers.length > 1 ? 's' : ''} bloquant${blockers.length > 1 ? 's' : ''} à résoudre.`}
            </p>
          </div>
          <button
            type="button"
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
          >
            Recalculer
          </button>
        </div>
      </header>

      {!ready && (
        <InfoCallout tone="warning">
          <p className="font-medium">Indicateurs bloquants pour la clôture</p>
          <ul className="text-[11px] mt-2 space-y-1">
            {blockers.map((b) => (
              <li key={b.code} className="flex items-center gap-2">
                <span className="font-mono text-amber-700 dark:text-amber-300">{b.code}</span>
                <span>{b.title}</span>
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
              <span className="font-mono text-[11px] text-zinc-500">
                {okCount}/{items.length}
              </span>
            </div>
            <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {items.map((ind) => (
                <li key={ind.code} className="grid grid-cols-[40px_60px_1fr_120px_120px] gap-3 py-3 px-1 items-center text-[13px]">
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
                  <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1">
                    {ind.proofs.length > 0 && (
                      <>
                        <Paperclip className="w-3 h-3" />
                        {ind.proofs.length} preuve{ind.proofs.length > 1 ? 's' : ''}
                      </>
                    )}
                  </span>
                  {ind.blocking && !ind.satisfied ? (
                    <StatusPill tone="warning">bloquant</StatusPill>
                  ) : (
                    <Link
                      href="#"
                      className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline-offset-2 hover:underline transition justify-self-end"
                    >
                      Joindre une preuve
                    </Link>
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
