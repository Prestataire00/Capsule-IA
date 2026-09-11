// ARCHETYPE: command
// Justification: home dashboard convivial style Notion/Linear — hero personnalisé + KPI multi-couleurs + charts SVG + à-traiter + table dossiers + Qualiopi card.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowUpRight, FolderOpen, Clock, GraduationCap, BarChart3,
  FileSignature, ClipboardCheck, ClipboardList, Calendar, Info, Eye,
} from 'lucide-react';

import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { ProgressBar } from '@/shared/ui/progress-bar';
import { SectionLabel } from '@/shared/ui/section-label';

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

const MOTIFS: Record<string, string> = {
  'no-trainer-membership':
    "Cet accès est réservé aux formateurs. Votre compte n'est rattaché à aucune fiche formateur — vous avez été ramené ici.",
};

const CARD = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm';
const RECENT_GRID = 'grid grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_120px_40px] gap-3 px-5';

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
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const tasks = [
    { icon: FileSignature, label: 'Documents à signer', count: kpis.toSign, href: '/documents' },
    { icon: ClipboardCheck, label: 'Émargements manquants', count: kpis.attendanceMissing, href: '/dossiers' },
    { icon: ClipboardList, label: 'Questionnaires à compléter', count: kpis.questionnairesPending, href: '/dossiers' },
  ];
  const tiles: { href: string; label: string; value: string | number; icon: ComponentType<{ className?: string }> }[] = [
    { href: '/dossiers', label: 'Dossiers actifs', value: kpis.dossiersActive, icon: FolderOpen },
    { href: '/factures', label: 'CA en cours', value: euro.format(kpis.revenueInProgressCents / 100), icon: Clock },
    { href: '/dossiers', label: 'Clôturés ce mois', value: kpis.dossiersClosedThisMonth, icon: GraduationCap },
    { href: '/qualiopi', label: 'Taux Qualiopi', value: `${tauxQualiopi}%`, icon: BarChart3 },
  ];
  const fundersTotal = charts.funders.reduce((a, f) => a + f.value, 0);
  const fundersMax = Math.max(1, ...charts.funders.map((f) => f.value));
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
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      {motif && (
        <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900 dark:text-amber-200">{motif}</p>
        </div>
      )}
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <SectionLabel className="mb-2">Accueil</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
            {greet()} {firstName}
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            Voici l'activité de votre organisme aujourd'hui.
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 h-9 inline-flex items-center gap-2 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm tabular-nums">
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          {start} – {end}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" aria-label="Chiffres clés">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.label} href={t.href} className={`group ${CARD} p-5 hover:shadow-md transition block`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-zinc-400" />
                  {t.label}
                </p>
                <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-600 dark:group-hover:text-orange-300 transition" />
              </div>
              <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 mt-3">{t.value}</p>
            </Link>
          );
        })}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <section className={`lg:col-span-4 ${CARD} p-5`}>
          <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            Répartition des dossiers par financeur
          </h2>
          {charts.funders.length === 0 ? (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 py-8 text-center">
              Aucun financeur rattaché à un dossier pour l&apos;instant.
            </p>
          ) : (
            <ul className="grid gap-3">
              {charts.funders.map((f) => {
                const share = fundersTotal > 0 ? Math.round((f.value / fundersTotal) * 100) : 0;
                return (
                  <li key={f.label} title={`${f.label} · ${f.value} dossier${f.value > 1 ? 's' : ''} · ${share} %`}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{f.label}</span>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                        {f.value} · {share} %
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-orange-100 dark:bg-orange-950/50">
                      <div className="h-full rounded-full bg-orange-500" style={{ width: `${(f.value / fundersMax) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`lg:col-span-5 ${CARD} p-5 min-w-0`}>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">
              Activité des 7 derniers jours
            </h2>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {activityTotal} dossier{activityTotal > 1 ? 's' : ''} créé{activityTotal > 1 ? 's' : ''}
            </p>
          </div>
          <ActivityChart points={charts.activityPoints} labels={charts.activityLabels} />
        </section>

        <section className={`lg:col-span-3 ${CARD} p-5`}>
          <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            À traiter
          </h2>
          <ul className="space-y-1">
            {tasks.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-md hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition group"
                  >
                    <Icon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <span className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300 truncate">{t.label}</span>
                    <span
                      className={`text-[15px] font-extrabold tabular-nums ${
                        t.count > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'
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
        <section className={`lg:col-span-8 ${CARD} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Dossiers récents</h2>
            <Link href="/dossiers" className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 inline-flex items-center gap-1 transition">
              Voir tous les dossiers
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className={`${RECENT_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
                <div>Dossier</div>
                <div>Apprenant</div>
                <div>Formation</div>
                <div>Entreprise</div>
                <div>Statut</div>
                <div>Avancement</div>
                <div className="sr-only">Actions</div>
              </div>
              {recents.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
                  Aucun dossier pour l&apos;instant.
                </p>
              ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {recents.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dossiers/${d.id}`}
                      className={`${RECENT_GRID} py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors items-center group`}
                    >
                      <IdPill>{d.reference}</IdPill>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={d.learnerName} />
                        <span className="text-zinc-900 dark:text-zinc-100 font-bold truncate">{d.learnerName}</span>
                      </div>
                      <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.formationTitle}</span>
                      <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.companyName ?? '—'}</span>
                      <div>
                        <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={d.progress} tone={d.progress === 100 ? 'emerald' : 'violet'} size="sm" />
                        <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums w-9 text-right">
                          {d.progress}%
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="ml-auto w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 group-hover:bg-orange-50 group-hover:text-orange-600 dark:group-hover:bg-orange-950/40 dark:group-hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              )}
            </div>
          </div>
        </section>

        <section className={`lg:col-span-4 ${CARD} p-5`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Conformité Qualiopi</h2>
            <StatusPill tone={tauxQualiopi >= 90 ? 'success' : 'warning'}>
              {tauxQualiopi >= 90 ? 'Conforme' : 'À compléter'}
            </StatusPill>
          </div>
          {/* Le taux vient de `app.v_org_kpis` : la part des dossiers actifs sans
              élément Qualiopi bloquant. Un « 92 % Conforme » codé en dur, avec
              sa liste de contrôles tous au vert et sa date figée, s'affichait
              auparavant quel que soit l'organisme — sur un sujet où un chiffre
              inventé peut coûter une certification (audit CAP-27). */}
          <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">
            {tauxQualiopi}%
          </p>
          <div
            className="mt-3 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800"
            title={`Conforme · ${tauxQualiopi} %`}
          >
            <div
              className={`h-full rounded-full ${tauxQualiopi >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, tauxQualiopi))}%` }}
            />
          </div>
          <p className="mt-4 text-[12px] text-zinc-500 dark:text-zinc-400">
            Part de vos dossiers actifs sans élément Qualiopi bloquant. Le détail par indicateur
            est sur le tableau de bord Qualiopi.
          </p>

          <Link
            href="/qualiopi"
            className="mt-5 inline-flex items-center justify-center w-full bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-950/60 text-orange-700 dark:text-orange-300 text-[13px] font-semibold px-4 h-9 rounded-lg transition"
          >
            Voir le tableau de bord Qualiopi
          </Link>
        </section>
      </div>

    </div>
  );
}

function ActivityChart({ points, labels }: { points: number[]; labels: string[] }) {
  const w = 460;
  const h = 170;
  const padL = 26;
  const padR = 4;
  const padT = 20;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const max = Math.max(2, Math.ceil(Math.max(0, ...points) / 2) * 2);
  const slot = iw / Math.max(1, points.length);
  const bw = Math.min(32, slot - 12);
  const base = padT + ih;
  const sy = (v: number) => (v / max) * ih;
  const last = points.length - 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Dossiers créés par jour sur les 7 derniers jours" className="block overflow-visible">
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={base - sy(t)} y2={base - sy(t)} className="stroke-zinc-200 dark:stroke-zinc-800" />
          <text x={padL - 8} y={base - sy(t) + 3.5} textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums">
            {t}
          </text>
        </g>
      ))}
      {points.map((v, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        const hh = sy(v);
        const y0 = base - hh;
        const r = Math.min(4, hh);
        const label = labels[i] ?? '';
        const tip = `${label} · ${v} dossier${v > 1 ? 's' : ''} créé${v > 1 ? 's' : ''}`;
        return (
          <g key={`${label}-${i}`}>
            {v === 0 ? (
              <rect x={x} y={base - 2} width={bw} height={2} rx={1} className="fill-zinc-200 dark:fill-zinc-800">
                <title>{tip}</title>
              </rect>
            ) : (
              <path
                d={`M${x},${base} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + bw - r} Q${x + bw},${y0} ${x + bw},${y0 + r} V${base} Z`}
                className="fill-orange-500"
              >
                <title>{tip}</title>
              </path>
            )}
            {v > 0 && (
              <text x={x + bw / 2} y={y0 - 6} textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-100 text-[11px] font-bold tabular-nums">
                {v}
              </text>
            )}
            <text
              x={x + bw / 2}
              y={h - 6}
              textAnchor="middle"
              className={i === last ? 'fill-orange-600 dark:fill-orange-400 text-[10px] font-bold tabular-nums' : 'fill-zinc-400 text-[10px] tabular-nums'}
            >
              {i === last ? "Aujourd'hui" : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {initials}
    </span>
  );
}
