// ARCHETYPE: command
// Justification: statistiques agrégées des questionnaires — taux de retour, NPS, satisfaction par type.

import Link from 'next/link';
import { ArrowLeft, BarChart3, TrendingUp, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';

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
    <div className="max-w-6xl w-full mx-auto px-8 py-8">
      <Link href="/questionnaires" className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Questionnaires
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight inline-flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-orange-500" /> Statistiques
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">Taux de retour, NPS et satisfaction agrégés — preuves Qualiopi I26/I27.</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Questionnaires" value={total} icon={Users} accent="blue" />
        <StatCard label="Taux de retour" value={<span>{responseRate}<span className="text-[15px] text-zinc-400 font-normal">%</span></span>} icon={TrendingUp} accent="emerald" hint={`${completed}/${total} complétés`} hintTone="success" />
        <StatCard label="NPS global" value={globalNps ?? '—'} icon={TrendingUp} accent="violet" hint={`${allNps.length} réponse${allNps.length > 1 ? 's' : ''}`} hintTone="neutral" />
        <StatCard label="Satisfaction" value={<span>{avgSatisfaction ?? '—'}{avgSatisfaction != null && <span className="text-[15px] text-zinc-400 font-normal">/100</span>}</span>} icon={BarChart3} accent="amber" />
      </section>

      {allNps.length > 0 && (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 mb-8">
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Répartition NPS</p>
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            <div className="bg-rose-400" style={{ width: `${(detractors / npsTotal) * 100}%` }} title={`Détracteurs : ${detractors}`} />
            <div className="bg-amber-300" style={{ width: `${(passives / npsTotal) * 100}%` }} title={`Passifs : ${passives}`} />
            <div className="bg-emerald-400" style={{ width: `${(promoters / npsTotal) * 100}%` }} title={`Promoteurs : ${promoters}`} />
          </div>
          <div className="flex items-center gap-4 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Promoteurs {promoters}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" /> Passifs {passives}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Détracteurs {detractors}</span>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_100px_100px_110px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Type</div>
          <div className="text-right">Envoyés</div>
          <div className="text-right">Retour</div>
          <div className="text-right">NPS</div>
          <div className="text-right">Satisfaction</div>
        </div>
        {kindRows.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 px-5 py-6 text-center">Aucune donnée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {kindRows.map(([kind, b]) => {
              const rate = b.total ? Math.round((b.completed / b.total) * 100) : 0;
              const nps = npsScore(b.nps);
              const sat = b.scores.length ? Math.round(b.scores.reduce((s, n) => s + n, 0) / b.scores.length) : null;
              return (
                <li key={kind} className="grid grid-cols-[1fr_100px_100px_100px_110px] gap-3 px-5 py-3 items-center text-[13px]">
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium">{KIND_LABEL[kind] ?? kind}</span>
                  <span className="text-right text-zinc-600 dark:text-zinc-400 tabular-nums">{b.total}</span>
                  <span className="text-right text-zinc-600 dark:text-zinc-400 tabular-nums">{rate}%</span>
                  <span className="text-right text-zinc-600 dark:text-zinc-400 tabular-nums">{nps ?? '—'}</span>
                  <span className="text-right text-zinc-600 dark:text-zinc-400 tabular-nums">{sat != null ? `${sat}/100` : '—'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
