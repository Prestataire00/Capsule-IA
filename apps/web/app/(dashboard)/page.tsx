// ARCHETYPE: command
// Justification: tableau de bord d'accueil — forme d'origine (salutation, 4 chiffres clés, financeurs, activité, à traiter, dossiers récents, Qualiopi) en couleurs charte v4.

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowUpRight, FolderOpen, Clock, GraduationCap, BarChart3,
  FileSignature, ClipboardCheck, ClipboardList, Calendar, Info, Plus,
} from 'lucide-react';

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

// Un motif s'adresse à quelqu'un qui n'a rien fait de mal : il explique, il
// n'accuse pas. « Votre compte n'est rattaché à aucune fiche formateur » se
// lisait comme un défaut de configuration alors qu'un administrateur est
// simplement au bon endroit.
const MOTIFS: Record<string, string> = {
  'no-trainer-membership':
    "L'espace formateur est réservé aux intervenants qui y animent des séances. Vous voici dans votre espace d'organisme.",
};

type Accent = 'orange' | 'emerald' | 'blue' | 'purple' | 'amber';

// Classes écrites en entier : Tailwind ne détecte pas les noms construits dynamiquement.
const ACCENTS: Record<Accent, { card: string; chip: string; value: string; soft: string }> = {
  orange: {
    card: 'from-orange-50 to-white border-orange-100 dark:from-orange-950/40 dark:to-zinc-900 dark:border-orange-900/40',
    chip: 'bg-orange-500 shadow-orange-500/30',
    value: 'text-orange-700 dark:text-orange-300',
    soft: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  },
  emerald: {
    card: 'from-emerald-50 to-white border-emerald-100 dark:from-emerald-950/40 dark:to-zinc-900 dark:border-emerald-900/40',
    chip: 'bg-emerald-500 shadow-emerald-500/30',
    value: 'text-emerald-700 dark:text-emerald-300',
    soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  blue: {
    card: 'from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-zinc-900 dark:border-blue-900/40',
    chip: 'bg-blue-500 shadow-blue-500/30',
    value: 'text-blue-700 dark:text-blue-300',
    soft: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  purple: {
    card: 'from-purple-50 to-white border-purple-100 dark:from-purple-950/40 dark:to-zinc-900 dark:border-purple-900/40',
    chip: 'bg-purple-500 shadow-purple-500/30',
    value: 'text-purple-700 dark:text-purple-300',
    soft: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  },
  amber: {
    card: 'from-amber-50 to-white border-amber-100 dark:from-amber-950/40 dark:to-zinc-900 dark:border-amber-900/40',
    chip: 'bg-amber-500 shadow-amber-500/30',
    value: 'text-amber-700 dark:text-amber-300',
    soft: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
};

const CARD = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm';

function KpiCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <Link href={href} className={`group block rounded-xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md transition ${a.card}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`w-10 h-10 rounded-xl grid place-items-center text-white shadow-md ${a.chip}`}>
          <Icon className="w-5 h-5" />
        </span>
        <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition" />
      </div>
      <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400 mt-4">{label}</p>
      <p className={`text-[30px] leading-none font-extrabold tabular-nums mt-1.5 ${a.value}`}>{value}</p>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2">{hint}</p>
    </Link>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: { reason?: string; refus?: string };
}) {
  const kpis = await getOrgKpis(supabaseServer());
  const charts = await getHomeCharts(supabaseServer());
  const recents = await getRecentDossiers(supabaseServer());
  // `qualiopiRate` est une fraction entre 0 et 1. Le camembert la recevait brute
  // comme un pourcentage : il affichait « 1 % » ou « 0,85 % », toujours
  // « À compléter ». Une seule conversion, partagée avec la carte.
  const tauxQualiopi = Math.round(kpis.qualiopiRate * 100);
  const conforme = tauxQualiopi >= 90;
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const tasks: { icon: ComponentType<{ className?: string }>; label: string; count: number; href: string; accent: Accent }[] = [
    { icon: FileSignature, label: 'Documents à signer', count: kpis.toSign, href: '/documents', accent: 'orange' },
    { icon: ClipboardCheck, label: 'Émargements manquants', count: kpis.attendanceMissing, href: '/dossiers', accent: 'amber' },
    { icon: ClipboardList, label: 'Questionnaires à compléter', count: kpis.questionnairesPending, href: '/dossiers', accent: 'blue' },
  ];
  const activityTotal = charts.activityPoints.reduce((a, b) => a + b, 0);
  const me = await getCurrentMember();
  const firstName = (me?.fullName ?? '').split(' ')[0] ?? '';
  const today = new Date();
  const start = format(today, 'd MMM', { locale: fr });
  const end = format(new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000), 'd MMM yyyy', { locale: fr });

  // Les redirections de la garde d'accès étaient muettes : l'utilisateur se
  // retrouvait sur l'accueil sans savoir pourquoi, et lisait ça comme un bug
  // (audit CAP-29).
  const motif = searchParams?.reason
    ? MOTIFS[searchParams.reason]
    : searchParams?.refus
      ? `Vous n'avez pas accès à la section « ${searchParams.refus} » avec votre rôle.`
      : null;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      {motif && (
        <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900 dark:text-amber-200">{motif}</p>
        </div>
      )}

      <header className="mb-6 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-rose-950/30 px-7 py-6 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-orange-600 dark:text-orange-400">Tableau de bord</p>
          <h1 className="mt-2 text-[30px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
            {greet()} {firstName}
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">Voici l&apos;activité de votre organisme aujourd&apos;hui.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-white/80 dark:bg-zinc-900/80 border border-orange-100 dark:border-zinc-800 rounded-lg px-3 h-10 inline-flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 shadow-sm">
            <Calendar className="w-4 h-4 text-orange-500" />
            {start} – {end}
          </span>
          <Link
            href="/dossiers/nouveau"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau dossier
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard href="/dossiers" label="Dossiers actifs" value={kpis.dossiersActive} hint="en cours de formation" icon={FolderOpen} accent="orange" />
        <KpiCard href="/factures" label="CA en cours" value={euro.format(kpis.revenueInProgressCents / 100)} hint="sur les dossiers en cours" icon={Clock} accent="emerald" />
        <KpiCard href="/dossiers" label="Clôturés ce mois" value={kpis.dossiersClosedThisMonth} hint="formations terminées" icon={GraduationCap} accent="blue" />
        <KpiCard
          href="/qualiopi"
          label="Taux Qualiopi"
          value={`${tauxQualiopi} %`}
          hint={conforme ? 'Conforme' : 'À compléter'}
          icon={BarChart3}
          accent="purple"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <section className={`lg:col-span-4 ${CARD}`}>
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-4">Répartition des dossiers par financeur</h2>
          {charts.funders.length === 0 ? (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 py-8 text-center">
              Aucun financeur rattaché à un dossier pour l&apos;instant.
            </p>
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart
                data={charts.funders}
                size={150}
                strokeWidth={22}
                centerTitle={charts.funders.reduce((a, f) => a + f.value, 0)}
                centerSubtitle="dossiers"
              />
              <div className="flex-1 min-w-0">
                <DonutLegend data={charts.funders} />
              </div>
            </div>
          )}
        </section>

        <section className={`lg:col-span-5 ${CARD}`}>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Activité des 7 derniers jours</h2>
            <span className="text-[12px] font-bold tabular-nums px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              {activityTotal} dossier{activityTotal > 1 ? 's' : ''} créé{activityTotal > 1 ? 's' : ''}
            </span>
          </div>
          <LineChart
            points={charts.activityPoints}
            labels={charts.activityLabels}
            height={150}
            color="#f97316"
            fillColor="rgba(249, 115, 22, 0.14)"
          />
        </section>

        <section className={`lg:col-span-3 ${CARD}`}>
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-4">À traiter</h2>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const Icon = t.icon;
              const a = ACCENTS[t.accent];
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition"
                  >
                    <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${a.soft}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{t.label}</span>
                    <span
                      className={`min-w-[26px] h-6 px-2 rounded-full text-[12px] font-bold tabular-nums grid place-items-center ${
                        t.count > 0 ? a.soft : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {t.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Dossiers récents</h2>
            <Link href="/dossiers" className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 inline-flex items-center gap-1 transition">
              Voir tous les dossiers
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[120px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
                <div>Dossier</div>
                <div>Apprenant</div>
                <div>Formation</div>
                <div>Entreprise</div>
                <div>Statut</div>
                <div>Avancement</div>
              </div>
              {recents.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-400">Aucun dossier pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {recents.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="grid grid-cols-[120px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-3.5 text-[13px] hover:bg-orange-50/40 dark:hover:bg-zinc-800/30 transition items-center"
                      >
                        <IdPill>{d.reference}</IdPill>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={d.learnerName} />
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{d.learnerName}</span>
                        </div>
                        <span className="font-semibold text-orange-700 dark:text-orange-300 truncate">{d.formationTitle}</span>
                        <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.companyName ?? '—'}</span>
                        <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={d.progress} tone={d.progress === 100 ? 'emerald' : 'violet'} size="sm" />
                          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums w-9 text-right">{d.progress}%</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 rounded-xl p-5 shadow-sm border border-purple-100 dark:border-purple-900/40 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/40 dark:to-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Conformité Qualiopi</h2>
            <StatusPill tone={conforme ? 'success' : 'warning'}>{conforme ? 'Conforme' : 'À compléter'}</StatusPill>
          </div>
          {/* Le taux vient de `app.v_org_kpis` : la part des dossiers actifs sans
              élément Qualiopi bloquant. Un « 92 % Conforme » codé en dur, avec
              sa liste de contrôles tous au vert et sa date figée, s'affichait
              auparavant quel que soit l'organisme — sur un sujet où un chiffre
              inventé peut coûter une certification (audit CAP-27). */}
          <div className="flex items-center gap-5">
            <DonutChart
              data={[
                { label: 'Conforme', value: tauxQualiopi, color: '#10b981' },
                { label: 'Restant', value: Math.max(0, 100 - tauxQualiopi), color: '#c8d0dd' },
              ]}
              size={120}
              strokeWidth={16}
              centerTitle={<span>{tauxQualiopi}%</span>}
              centerSubtitle={<span className={conforme ? 'text-emerald-600' : 'text-amber-600'}>{conforme ? 'Conforme' : 'À compléter'}</span>}
            />
            <p className="flex-1 text-[12px] text-zinc-600 dark:text-zinc-400">
              Part de vos dossiers actifs sans élément Qualiopi bloquant. Le détail par indicateur est sur le tableau de
              bord Qualiopi.
            </p>
          </div>

          <Link
            href="/qualiopi"
            className="mt-5 block w-full text-center bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-semibold px-4 h-10 leading-10 rounded-lg transition shadow-sm shadow-purple-600/30"
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
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
