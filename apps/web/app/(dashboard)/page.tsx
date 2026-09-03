// ARCHETYPE: command
// Justification: home dashboard convivial style Notion/Linear — hero personnalisé + KPI multi-couleurs + charts SVG + à-traiter + table dossiers + Qualiopi card.

import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowUpRight, FolderOpen, Clock, GraduationCap, BarChart3,
  FileSignature, ClipboardCheck, ClipboardList, Calendar,
} from 'lucide-react';

import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { DonutChart, DonutLegend } from '@/shared/ui/donut-chart';
import { LineChart } from '@/shared/ui/line-chart';
import { ProgressBar } from '@/shared/ui/progress-bar';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { getHomeCharts } from '@/features/reports/home-charts.query';
import { getRecentDossiers } from '@/features/reports/recent-dossiers.query';
import { getOrgKpis } from '@/features/reports/org-kpis.query';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

const greet = () => {
  const h = new Date().getHours();
  if (h < 6) return 'Bonsoir';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bel après-midi';
  return 'Bonsoir';
};

const taskColors = {
  violet: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-600 dark:text-violet-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400' },
};

export default async function Home() {
  const kpis = await getOrgKpis(supabaseServer());
  const charts = await getHomeCharts(supabaseServer());
  const recents = await getRecentDossiers(supabaseServer());
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const tasks = [
    { icon: FileSignature, label: 'Documents à signer', count: kpis.toSign, href: '/documents', color: 'violet' as const },
    { icon: ClipboardCheck, label: 'Émargements manquants', count: kpis.attendanceMissing, href: '/dossiers', color: 'amber' as const },
    { icon: ClipboardList, label: 'Questionnaires à compléter', count: kpis.questionnairesPending, href: '/dossiers', color: 'blue' as const },
  ];
  const me = await getCurrentMember();
  const firstName = (me?.fullName ?? '').split(' ')[0] ?? '';
  const today = new Date();
  const start = format(today, 'd MMM', { locale: fr });
  const end = format(new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000), 'd MMM yyyy', { locale: fr });

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {greet()} {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Voici l'activité de votre organisme aujourd'hui.
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 shadow-sm">
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          {start} – {end}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard href="/dossiers" label="Dossiers actifs" value={kpis.dossiersActive} icon={FolderOpen} accent="purple" />
        <StatCard href="/factures" label="CA en cours" value={euro.format(kpis.revenueInProgressCents / 100)} icon={Clock} accent="emerald" />
        <StatCard href="/dossiers" label="Clôturés ce mois" value={kpis.dossiersClosedThisMonth} icon={GraduationCap} accent="blue" />
        <StatCard href="/qualiopi" label="Taux Qualiopi" value={`${Math.round(kpis.qualiopiRate * 100)}%`} icon={BarChart3} accent="amber" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <section className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Répartition des dossiers par financeur
          </h2>
          {charts.funders.length === 0 ? (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 py-8 text-center">
              Aucun financeur rattaché à un dossier pour l&apos;instant.
            </p>
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart data={charts.funders} size={150} strokeWidth={22} />
              <div className="flex-1 min-w-0">
                <DonutLegend data={charts.funders} />
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Activité des 7 derniers jours
          </h2>
          <LineChart points={charts.activityPoints} labels={charts.activityLabels} height={150} />
        </section>

        <section className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            À traiter
          </h2>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const Icon = t.icon;
              const c = taskColors[t.color];
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
                  >
                    <span className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${c.text}`} />
                    </span>
                    <span className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300 truncate">{t.label}</span>
                    <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{t.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Dossiers récents</h2>
            <Link href="/dossiers" className="text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 inline-flex items-center gap-1 transition">
              Voir tous les dossiers
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div>
            <div className="grid grid-cols-[110px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <div>Dossier</div>
              <div>Apprenant</div>
              <div>Formation</div>
              <div>Entreprise</div>
              <div>Statut</div>
              <div>Avancement</div>
            </div>
            {recents.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
                Aucun dossier pour l&apos;instant.
              </p>
            ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recents.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="grid grid-cols-[110px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition items-center"
                  >
                    <IdPill>{d.reference}</IdPill>
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={d.learnerName} />
                      <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.learnerName}</span>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.formationTitle}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.companyName ?? '—'}</span>
                    <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={d.progress} tone={d.progress === 100 ? 'emerald' : 'violet'} size="sm" />
                      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums w-9 text-right">
                        {d.progress}%
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Conformité Qualiopi</h2>
          </div>
          {/* Le taux vient de `app.v_org_kpis` : la part des dossiers actifs sans
              élément Qualiopi bloquant. Un « 92 % Conforme » codé en dur, avec
              sa liste de contrôles tous au vert et sa date figée, s'affichait
              auparavant quel que soit l'organisme — sur un sujet où un chiffre
              inventé peut coûter une certification (audit CAP-27). */}
          <div className="flex items-center gap-5">
            <DonutChart
              data={[
                { label: 'Conforme', value: kpis.qualiopiRate, color: '#10b981' },
                { label: 'Restant', value: Math.max(0, 100 - kpis.qualiopiRate), color: '#e4e4e7' },
              ]}
              size={120}
              strokeWidth={16}
              centerTitle={<span>{kpis.qualiopiRate}%</span>}
              centerSubtitle={
                <span className={kpis.qualiopiRate >= 90 ? 'text-emerald-600' : 'text-amber-600'}>
                  {kpis.qualiopiRate >= 90 ? 'Conforme' : 'À compléter'}
                </span>
              }
            />
            <p className="flex-1 text-[12px] text-zinc-600 dark:text-zinc-400">
              Part de vos dossiers actifs sans élément Qualiopi bloquant. Le détail par indicateur
              est sur le tableau de bord Qualiopi.
            </p>
          </div>

          <Link
            href="/qualiopi"
            className="block w-full text-center bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[13px] font-medium px-4 py-2 rounded-lg transition"
          >
            Voir le tableau de bord Qualiopi
          </Link>
        </section>
      </div>

    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const palette = [
    'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  ];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
