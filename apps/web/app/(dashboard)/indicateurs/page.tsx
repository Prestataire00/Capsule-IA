// ARCHETYPE: command
// Justification: indicateurs de résultats (Qualiopi indicateur 2 — publicité des
// résultats). Lecture seule, calculée depuis les dossiers terminés et les
// questionnaires de satisfaction ; alimente aussi la page programme publique.
import Link from 'next/link';
import { Users, Smile, MessageSquare, BookOpen } from 'lucide-react';
import type { ComponentType } from 'react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { loadIndicateurs } from '@/features/indicateurs/load-indicateurs';
import { loadDeclared, fusionner } from '@/features/indicateurs/declared';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { formationColorMap, deepColor, tintColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
import { DeclaredPanel } from './declared-panel.client';

export const dynamic = 'force-dynamic';

const pct = (v: number | null): string => (v === null ? '—' : `${v} %`);

export default async function IndicateursPage({ searchParams }: { searchParams: { annee?: string } }) {
  await requireAccess('qualiopi');

  const currentYear = new Date().getFullYear();
  const year =
    searchParams.annee === 'toutes'
      ? null
      : searchParams.annee && /^\d{4}$/.test(searchParams.annee)
        ? Number(searchParams.annee)
        : currentYear;

  const sb = supabaseServer();
  const me = await getCurrentMember();
  const calcul = await loadIndicateurs(sb as never, year);

  // Les chiffres déclarés à la main complètent le calcul : un organisme arrive
  // avec un historique, et la fiche publique ne peut pas rester vide en
  // attendant que la plateforme accumule des données (CAP-24).
  const declarations = me ? await loadDeclared(me.organizationId, year) : [];
  const data = fusionner(calcul, declarations);

  const { data: formationRows } = me
    ? await supabaseAdmin()
        .schema('app')
        .from('formations')
        .select('id, title, created_at')
        .eq('organization_id', me.organizationId)
        .is('deleted_at', null)
        .order('title')
    : { data: [] };
  const formationList = (formationRows ?? []) as { id: string; title: string; created_at: string | null }[];
  const formations = formationList.map((f) => ({
    id: f.id,
    title: f.title,
  }));
  const colors = formationColorMap(formationList);
  const colorOf = (id: string | null | undefined) => (id ? colors.get(id) ?? NEUTRAL_COLOR : NEUTRAL_COLOR);
  const couleurs = Object.fromEntries(colors);

  const tiles: { label: string; value: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
    { label: 'Apprenants formés', value: String(data.learnersTrained), hint: year === null ? 'toutes périodes' : `en ${year}`, icon: Users },
    {
      label: 'Satisfaction globale',
      value: pct(data.satisfactionRate),
      hint: `${data.satisfactionResponses} réponse${data.satisfactionResponses > 1 ? 's' : ''}`,
      icon: Smile,
    },
    { label: 'Taux de retour', value: pct(data.responseRate), hint: 'questionnaires renseignés', icon: MessageSquare },
    { label: 'Formations dispensées', value: String(data.formationsDelivered), hint: 'au moins un dossier terminé', icon: BookOpen },
  ];

  const periods: Array<{ value: string; label: string }> = [
    { value: String(currentYear), label: String(currentYear) },
    { value: String(currentYear - 1), label: String(currentYear - 1) },
    { value: String(currentYear - 2), label: String(currentYear - 2) },
    { value: 'toutes', label: 'Toutes périodes' },
  ];
  const activePeriod = year === null ? 'toutes' : String(year);

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-9 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <SectionLabel className="mb-2">Qualité · Qualiopi</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
            Indicateurs de résultats
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
            Calculés en direct depuis vos dossiers terminés et vos questionnaires de satisfaction —
            aucune saisie. Publiés automatiquement sur la fiche publique de chaque formation
            (indicateur Qualiopi 2).
          </p>
        </div>
        <nav aria-label="Période" className="inline-flex flex-wrap p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70 text-[12px]">
          {periods.map((p) => (
            <Link
              key={p.value}
              href={`/indicateurs?annee=${p.value}`}
              aria-current={p.value === activePeriod ? 'page' : undefined}
              className={
                p.value === activePeriod
                  ? 'px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold shadow-sm tabular-nums'
                  : 'px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100 tabular-nums transition'
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
              <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-zinc-400" /> {t.label}
              </p>
              <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 mt-3">{t.value}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2 tabular-nums">{t.hint}</p>
            </div>
          );
        })}
      </div>

      <DeclaredPanel
        lignes={declarations.map((d) => ({
          id: d.id,
          formationId: d.formationId,
          formationTitle: d.formationTitle,
          year: d.year,
          learnersTrained: d.learnersTrained,
          satisfactionRate: d.satisfactionRate,
          satisfactionResponses: d.satisfactionResponses,
          responseRate: d.responseRate,
          formationsDelivered: d.formationsDelivered,
          source: d.source,
          note: d.note,
        }))}
        formations={formations}
        couleurs={couleurs}
        anneeParDefaut={year ?? currentYear}
      />

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200/70 dark:border-zinc-800">
          <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Par formation</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Ces chiffres apparaissent sur la fiche publique de la formation concernée.
          </p>
        </div>

        {data.byFormation.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={BookOpen}
              title="Aucun dossier terminé sur la période"
              description="Les indicateurs se remplissent dès qu'un dossier passe en terminé et que les questionnaires de satisfaction sont renseignés."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
                  <th className="px-5 h-9 font-bold">Formation</th>
                  <th className="px-5 h-9 font-bold text-right">Apprenants formés</th>
                  <th className="px-5 h-9 font-bold">Satisfaction</th>
                  <th className="px-5 h-9 font-bold text-right">Réponses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {data.byFormation.map((f) => {
                  const color = colorOf(f.formationId);
                  return (
                    <tr key={f.formationId} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />
                          <Link
                            href={`/formations/${f.formationId}`}
                            className="text-[14px] font-extrabold truncate hover:underline"
                            style={{ color: deepColor(color) }}
                          >
                            {f.title}
                          </Link>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{f.learners}</td>
                      <td className="px-5 py-3.5" title={`Satisfaction · ${pct(f.satisfactionRate)}`}>
                        <span className="flex items-center gap-2.5">
                          <span className="w-10 text-right font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{pct(f.satisfactionRate)}</span>
                          <span className="h-1.5 w-24 rounded-full" style={{ background: tintColor(color, 18) }}>
                            {f.satisfactionRate !== null && (
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.max(0, Math.min(100, f.satisfactionRate))}%`, background: color }}
                              />
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                        {f.satisfactionResponses}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Satisfaction = moyenne des notes des questionnaires de satisfaction (à chaud et à froid),
        ramenée sur 100. Apprenants formés = apprenants distincts sur les dossiers terminés, clôturés
        ou archivés.
      </p>
    </div>
  );
}
