// ARCHETYPE: command
// Justification: conformité Qualiopi réelle par indicateur + actions de transition gardées.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, X, ShieldCheck, ShieldAlert, ArrowRight, Minus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { InfoCallout } from '@/shared/ui/info-callout';
import { guidanceFor } from '@/features/dossier/qualiopi-guidance';
import { enVigueur, jourParis, type VersionRow } from '@/features/qualiopi/referentiel';
import { startTraining, closeDossier, recomputeNow } from './actions';
import { AssignTrainer } from './assign-trainer.client';
import { AssignLearner } from '../questionnaires/assign-learner';

// Indicateur (numéro officiel RNQ) → type de questionnaire à envoyer à l'apprenant.
const QST_KIND_BY_NUMBER: Record<number, string> = {
  4: 'positionnement',
  8: 'positionnement',
  11: 'evaluation_acquis',
  30: 'satisfaction_chaud',
};
const LEARNER_QST_KINDS = new Set(Object.values(QST_KIND_BY_NUMBER));

type DetailRow = {
  indicator_id: string;
  number: number;
  stage: 'entry' | 'closing' | 'none';
  is_blocking: boolean;
  satisfied: boolean;
  source: string;
  /** Absent des check-lists calculées avant la migration 0139 : vaut alors vrai. */
  applicable?: boolean;
};

type RefRow = VersionRow & { id: string; number: number; title: string; criterion: number; criterion_label: string | null };

export default async function QualiopiPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier } = await sb
    .schema('app').from('dossiers')
    .select('id, status, formation_id').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();
  const status = (dossier as { status: string }).status;
  const formationId = (dossier as { formation_id?: string | null }).formation_id ?? undefined;

  // Prod-safe : si les colonnes/tables ne sont pas encore migrées, data=null → section vide.
  const { data: checklist } = await sb
    .schema('app').from('qualiopi_dossier_checklists')
    .select('total_indicators, satisfied_indicators, entry_blocking_missing, closing_blocking_missing, details')
    .eq('dossier_id', params.id).maybeSingle();

  // Référentiel en vigueur uniquement : l'ancien jeu (« legacy »), mal numéroté,
  // est désactivé depuis la migration 0139 (audit CAP-35). Tant que celle-ci
  // n'est pas appliquée, la requête échoue et les titres retombent sur
  // « Indicateur N » — la page reste utilisable.
  const { data: indicators } = await sb
    .schema('app').from('qualiopi_indicators')
    .select('id, number, title, criterion, criterion_label, referential_version, effective_from, effective_until' as never)
    .eq('scope', 'dossier')
    .eq('is_active', true)
    .neq('referential_version' as never, 'legacy' as never);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (checklist as any) ?? {};
  const details: DetailRow[] = c.details ?? [];
  const entryBlockingMissing: number = c.entry_blocking_missing ?? 0;
  const closingBlockingMissing: number = c.closing_blocking_missing ?? 0;
  const refs = (indicators as unknown as RefRow[] | null) ?? [];
  // Libellés de la version qui a servi au calcul ; à défaut, de celle en vigueur.
  const refById = new Map(refs.map((i) => [i.id, i]));
  const jour = jourParis();
  const refByNumber = new Map<number, RefRow>(refs.filter((i) => enVigueur(i, jour)).map((i) => [i.number, i]));

  const enriched = details.map((d) => {
    const ref = refById.get(d.indicator_id) ?? refByNumber.get(d.number);
    return {
      number: d.number,
      title: ref?.title ?? `Indicateur ${d.number}`,
      criterion: ref?.criterion ?? 0,
      criterionLabel: ref?.criterion_label ?? null,
      satisfied: d.satisfied,
      applicable: d.applicable !== false,
      blocking: d.is_blocking,
      stage: d.stage,
      source: d.source,
    };
  });

  const byCriterion = enriched.reduce<Record<number, typeof enriched>>((acc, e) => {
    (acc[e.criterion] ||= []).push(e);
    return acc;
  }, {});

  const entryBlockers = enriched.filter((e) => e.applicable && e.stage === 'entry' && e.blocking && !e.satisfied);
  const closingBlockers = enriched.filter((e) => e.applicable && e.stage === 'closing' && e.blocking && !e.satisfied);
  const satisfied = c.satisfied_indicators ?? enriched.filter((e) => e.applicable && e.satisfied).length;
  const totalCount = c.total_indicators ?? enriched.filter((e) => e.applicable).length;
  const notApplicable = enriched.filter((e) => !e.applicable).length;
  const ready = entryBlockingMissing === 0 && closingBlockingMissing === 0;
  const i21Missing = enriched.some((e) => e.number === 21 && e.applicable && !e.satisfied);
  const { data: trainerRows } = await sb
    .schema('app').from('trainers').select('id, first_name, last_name').order('last_name');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainers = ((trainerRows as any[]) ?? []).map((t) => ({ id: t.id as string, name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() }));
  const { data: dtRows } = await sb
    .schema('app').from('dossier_trainers').select('trainer_id, is_lead').eq('dossier_id', params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentTrainerId = (((dtRows as any[]) ?? []).sort((x, y) => (y.is_lead ? 1 : 0) - (x.is_lead ? 1 : 0))[0]?.trainer_id ?? null) as string | null;

  // Modèles de questionnaires apprenant, regroupés par type — pour l'envoi inline.
  const { data: tplRows } = await sb
    .schema('app').from('questionnaire_templates').select('id, title, kind');
  const templatesByKind = new Map<string, { id: string; title: string }[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of ((tplRows as any[]) ?? [])) {
    if (!LEARNER_QST_KINDS.has(t.kind)) continue;
    const arr = templatesByKind.get(t.kind) ?? templatesByKind.set(t.kind, []).get(t.kind)!;
    arr.push({ id: t.id as string, title: t.title as string });
  }

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
              {notApplicable > 0 && ` ${notApplicable} indicateur(s) non applicable(s) à ce dossier.`}
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
          <p className="text-[12px] mt-0.5 mb-3 opacity-80">
            Pour chaque point ci-dessous : voici quoi faire et le lien direct pour le corriger.
          </p>
          {i21Missing && (
            <div className="mb-3">
              <AssignTrainer dossierId={params.id} trainers={trainers} currentTrainerId={currentTrainerId} />
            </div>
          )}
          <ul className="space-y-2">
            {[...entryBlockers, ...closingBlockers].map((b) => {
              const g = guidanceFor(b.number, b.source, { formationId, dossierId: params.id });
              const qstKind = QST_KIND_BY_NUMBER[b.number];
              const qstTemplates = qstKind ? templatesByKind.get(qstKind) : undefined;
              const inlineQuestionnaire = !!qstTemplates && qstTemplates.length > 0;
              return (
                <li
                  key={b.number}
                  className="bg-white/70 dark:bg-zinc-950/40 border border-amber-200/60 dark:border-amber-900/40 rounded-lg px-3 py-2.5"
                >
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="font-mono text-amber-700 dark:text-amber-300 mr-1.5">I{b.number}</span>
                    {b.title}
                    <span className="ml-1.5 text-[11px] font-normal text-amber-600/80">
                      ({b.stage === 'entry' ? "à l'entrée" : 'à la clôture'})
                    </span>
                  </p>
                  <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-0.5">{g.todo}</p>
                  <div className="mt-2">
                    {inlineQuestionnaire ? (
                      <AssignLearner dossierId={params.id} templates={qstTemplates!} />
                    ) : (
                      <Link
                        href={g.href ?? `/dossiers/${params.id}/${g.tab}`}
                        className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-md transition"
                      >
                        {g.linkLabel}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </InfoCallout>
      )}

      {Object.entries(byCriterion)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([criterion, items]) => {
          const applicables = items.filter((i) => i.applicable);
          const okCount = applicables.filter((i) => i.satisfied).length;
          const label = items[0]?.criterionLabel;
          return (
            <section key={criterion}>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>
                  Critère {criterion}
                  {label ? ` — ${label}` : ''}
                </SectionLabel>
                <span className="font-mono text-[11px] text-zinc-500">{okCount}/{applicables.length}</span>
              </div>
              <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
                {items.map((ind) => {
                  const g = guidanceFor(ind.number, ind.source, { formationId, dossierId: params.id });
                  return (
                    <li key={ind.number} className="grid grid-cols-[40px_60px_1fr_140px] gap-3 py-3 px-1 items-center text-[13px]">
                      {!ind.applicable ? (
                        <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center">
                          <Minus className="w-3 h-3" />
                        </span>
                      ) : ind.satisfied ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-zinc-500">I{ind.number}</span>
                      <span className={ind.applicable ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'}>
                        {ind.title}
                      </span>
                      {!ind.applicable ? (
                        <span className="text-[11px] text-zinc-400 justify-self-end">non applicable</span>
                      ) : ind.satisfied ? (
                        <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1 justify-self-end">
                          {ind.stage !== 'none' ? (ind.stage === 'entry' ? 'entrée' : 'clôture') : ''}
                        </span>
                      ) : (
                        <Link
                          href={g.href ?? `/dossiers/${params.id}/${g.tab}`}
                          title={g.todo}
                          className="justify-self-end inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                        >
                          {ind.blocking && <span className="text-amber-600 dark:text-amber-400 mr-1">bloquant ·</span>}
                          Corriger
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
