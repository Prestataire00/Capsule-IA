// ARCHETYPE: command
// Justification: indicateurs de résultats (Qualiopi indicateur 2 — publicité des
// résultats). Lecture seule, calculée depuis les dossiers terminés et les
// questionnaires de satisfaction ; alimente aussi la page programme publique.
import Link from 'next/link';
import { Users, Smile, MessageSquare, BookOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { loadIndicateurs } from '@/features/indicateurs/load-indicateurs';

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
  const data = await loadIndicateurs(sb as never, year);

  const periods: Array<{ value: string; label: string }> = [
    { value: String(currentYear), label: String(currentYear) },
    { value: String(currentYear - 1), label: String(currentYear - 1) },
    { value: String(currentYear - 2), label: String(currentYear - 2) },
    { value: 'toutes', label: 'Toutes périodes' },
  ];
  const activePeriod = year === null ? 'toutes' : String(year);

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-1">Qualité · Qualiopi</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Indicateurs de résultats
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Calculés en direct depuis vos dossiers terminés et vos questionnaires de satisfaction —
            aucune saisie. Publiés automatiquement sur la fiche publique de chaque formation
            (indicateur Qualiopi 2).
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <Link
              key={p.value}
              href={`/indicateurs?annee=${p.value}`}
              className={
                p.value === activePeriod
                  ? 'text-[12px] px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-300'
                  : 'text-[12px] px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition'
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Apprenants formés"
          value={String(data.learnersTrained)}
          hint={year === null ? 'toutes périodes' : `en ${year}`}
          icon={Users}
          accent="rose"
        />
        <StatCard
          label="Satisfaction globale"
          value={pct(data.satisfactionRate)}
          hint={`${data.satisfactionResponses} réponse${data.satisfactionResponses > 1 ? 's' : ''}`}
          icon={Smile}
          accent="emerald"
        />
        <StatCard
          label="Taux de retour"
          value={pct(data.responseRate)}
          hint="questionnaires renseignés"
          icon={MessageSquare}
          accent="blue"
        />
        <StatCard
          label="Formations dispensées"
          value={String(data.formationsDelivered)}
          hint="au moins un dossier terminé"
          icon={BookOpen}
          accent="purple"
        />
      </div>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Par formation</h2>
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
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50/60 dark:bg-zinc-950/40">
                  <th className="px-5 py-2.5 font-medium">Formation</th>
                  <th className="px-5 py-2.5 font-medium text-right">Apprenants formés</th>
                  <th className="px-5 py-2.5 font-medium text-right">Satisfaction</th>
                  <th className="px-5 py-2.5 font-medium text-right">Réponses</th>
                </tr>
              </thead>
              <tbody>
                {data.byFormation.map((f) => (
                  <tr
                    key={f.formationId}
                    className="border-t border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-950/40 transition"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/formations/${f.formationId}`}
                        className="text-zinc-900 dark:text-zinc-100 hover:text-purple-600 dark:hover:text-purple-400 transition"
                      >
                        {f.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.learners}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{pct(f.satisfactionRate)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {f.satisfactionResponses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Satisfaction = moyenne des notes des questionnaires de satisfaction (à chaud et à froid),
        ramenée sur 100. Apprenants formés = apprenants distincts sur les dossiers terminés, clôturés
        ou archivés.
      </p>
    </div>
  );
}
