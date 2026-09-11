// ARCHETYPE: command
// Justification: statistiques agrégées des questionnaires — taux de retour, NPS, satisfaction par type.

import Link from 'next/link';
import { ArrowLeft, BarChart3, TrendingUp, ClipboardList, Star, Smile } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { SectionLabel } from '@/shared/ui/section-label';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  evaluation_acquis: 'Évaluation des acquis',
  satisfaction_formateur: 'Satisfaction formateur',
  opco: 'Financeur',
  custom: 'Personnalisé',
};

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1.4fr)_80px_110px] gap-4 px-5';

type Row = {
  status: string;
  template: { kind: string } | null;
  response: { nps: number | null; score: number | null } | null;
};

function npsScore(values: number[]): number | null {
  if (values.length === 0) return null;
  const promoters = values.filter((n) => n >= 9).length;
  const detractors = values.filter((n) => n <= 6).length;
  return Math.round(((promoters - detractors) / values.length) * 100);
}

export default async function QuestionnaireAnalyticsPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('status, template:questionnaire_templates(kind), response:questionnaire_responses(nps, score)');
  const rows = (data as unknown as Row[] | null) ?? [];

  const total = rows.length;
  const completed = rows.filter((r) => r.status === 'completed').length;
  const responseRate = total ? Math.round((completed / total) * 100) : 0;

  const allNps = rows.map((r) => r.response?.nps).filter((n): n is number => typeof n === 'number');
  const globalNps = npsScore(allNps);
  const allScores = rows.map((r) => r.response?.score).filter((n): n is number => typeof n === 'number');
  const avgSatisfaction = allScores.length ? Math.round(allScores.reduce((s, n) => s + n, 0) / allScores.length) : null;

  // Agrégat par type.
  const byKind = new Map<string, { total: number; completed: number; nps: number[]; scores: number[] }>();
  for (const r of rows) {
    const kind = r.template?.kind ?? 'custom';
    const bucket = byKind.get(kind) ?? { total: 0, completed: 0, nps: [], scores: [] };
    bucket.total += 1;
    if (r.status === 'completed') bucket.completed += 1;
    if (typeof r.response?.nps === 'number') bucket.nps.push(r.response.nps);
    if (typeof r.response?.score === 'number') bucket.scores.push(r.response.score);
    byKind.set(kind, bucket);
  }
  const kindRows = [...byKind.entries()].sort((a, b) => b[1].total - a[1].total);

  const promoters = allNps.filter((n) => n >= 9).length;
  const passives = allNps.filter((n) => n >= 7 && n <= 8).length;
  const detractors = allNps.filter((n) => n <= 6).length;
  const npsTotal = allNps.length || 1;

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <Link href="/questionnaires" className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Questionnaires
      </Link>
      <header className="mb-7">
        <SectionLabel className="mb-2">Questionnaires</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Statistiques</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Taux de retour, NPS et satisfaction agrégés — preuves Qualiopi I26/I27.{' '}
          <span className="tabular-nums">
            {total} questionnaire{total > 1 ? 's' : ''} · {completed} complété{completed > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" aria-label="Synthèse">
        <KpiCard label="Questionnaires" value={total} icon={ClipboardList} accent="blue" />
        <KpiCard
          label="Taux de retour"
          value={
            <span>
              {responseRate}
              <span className="text-[15px] opacity-60 font-semibold">%</span>
            </span>
          }
          icon={TrendingUp}
          accent="emerald"
          hint={`${completed}/${total} complétés`}
        >
          <AccentBar value={completed} max={total} accent="emerald" />
        </KpiCard>
        <KpiCard label="NPS global" value={globalNps ?? '—'} icon={Star} accent="purple" hint={`${allNps.length} réponse${allNps.length > 1 ? 's' : ''}`} />
        <KpiCard
          label="Satisfaction"
          value={
            <span>
              {avgSatisfaction ?? '—'}
              {avgSatisfaction != null && <span className="text-[15px] opacity-60 font-semibold">/100</span>}
            </span>
          }
          icon={Smile}
          accent="teal"
        >
          {avgSatisfaction != null && <AccentBar value={avgSatisfaction} max={100} accent="teal" />}
        </KpiCard>
      </section>

      {allNps.length > 0 && (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 mb-8">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 mb-3 inline-flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.purple.soft}`}>
              <BarChart3 className="w-4 h-4" />
            </span>
            Répartition NPS
          </p>
          <div className="flex h-3 gap-[2px] rounded-full overflow-hidden mb-3">
            <div className="bg-rose-400" style={{ width: `${(detractors / npsTotal) * 100}%` }} title={`Détracteurs : ${detractors}`} />
            <div className="bg-amber-300" style={{ width: `${(passives / npsTotal) * 100}%` }} title={`Passifs : ${passives}`} />
            <div className="bg-emerald-400" style={{ width: `${(promoters / npsTotal) * 100}%` }} title={`Promoteurs : ${promoters}`} />
          </div>
          <div className="flex items-center gap-4 text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-400" /> Promoteurs {promoters}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-amber-300" /> Passifs {passives}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-rose-400" /> Détracteurs {detractors}</span>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Type</div>
            <div className="text-right">Envoyés</div>
            <div>Retour</div>
            <div className="text-right">NPS</div>
            <div className="text-right">Satisfaction</div>
          </div>
          {kindRows.length === 0 ? (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 px-5 py-6 text-center">Aucune donnée pour le moment.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {kindRows.map(([kind, b]) => {
                const rate = b.total ? Math.round((b.completed / b.total) * 100) : 0;
                const nps = npsScore(b.nps);
                const sat = b.scores.length ? Math.round(b.scores.reduce((s, n) => s + n, 0) / b.scores.length) : null;
                return (
                  <li key={kind} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <span className="min-w-0 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
                        <ClipboardList className="w-4 h-4" />
                      </span>
                      <span className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{KIND_LABEL[kind] ?? kind}</span>
                    </span>
                    <span className="text-right">
                      <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.blue.soft}`}>{b.total}</span>
                    </span>
                    <div className="flex items-center gap-3" title={`${b.completed}/${b.total} complétés`}>
                      <AccentBar value={b.completed} max={b.total} accent={rate >= 70 ? 'emerald' : rate >= 40 ? 'blue' : 'amber'} className="flex-1" />
                      <span className="w-10 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">{rate}%</span>
                    </div>
                    <span className={`text-right font-bold tabular-nums ${nps == null ? 'text-zinc-900 dark:text-zinc-100' : nps >= 30 ? ACCENTS.emerald.text : nps >= 0 ? ACCENTS.amber.text : ACCENTS.rose.text}`}>{nps ?? '—'}</span>
                    <span className="text-right text-zinc-700 dark:text-zinc-300 tabular-nums">{sat != null ? `${sat}/100` : '—'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
