// ARCHETYPE: command (sous-shell d'un dossier)
// Justification: vue détaillée d'un dossier avec hero et tabs.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MoreHorizontal, Calendar, Clock, Users as UsersIcon, Banknote } from 'lucide-react';
import {
  dossiers, learnerFullName, formationTitle, companyName, formatEuros,
} from '@/shared/mock/data';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { TabsNav } from '@/shared/components/layout/tabs-nav';

export default function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-8">
        <Link
          href="/dossiers"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tous les dossiers
        </Link>

        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-medium font-mono text-zinc-900 dark:text-zinc-100">
                {dossier.reference}
              </h1>
              <StatusPill tone={dossierStatusTone(dossier.status)}>
                {dossierStatusLabel(dossier.status)}
              </StatusPill>
            </div>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300">
              {learnerFullName(dossier.learnerId)}
              {companyName(dossier.companyId) && (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {' · '}
                  {companyName(dossier.companyId)}
                </span>
              )}
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {formationTitle(dossier.formationId)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              aria-label="Plus d'actions"
              className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {dossier.status === 'completed' && (
              <button
                type="button"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm"
              >
                Clôturer
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MiniStat
            icon={Calendar}
            label="Période"
            value={`${formatDate(dossier.startDate)} → ${formatDate(dossier.endDate)}`}
          />
          <MiniStat
            icon={Clock}
            label="Heures totales"
            value={`${dossier.totalHours} h`}
          />
          <MiniStat
            icon={UsersIcon}
            label="Modalité"
            value={modalityLabel(dossier.modality)}
          />
          <MiniStat
            icon={Banknote}
            label="Montant"
            value={formatEuros(dossier.totalAmountCents)}
          />
        </section>

        <TabsNav baseHref={`/dossiers/${dossier.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function modalityLabel(m: string) {
  return ({
    presentiel: 'Présentiel',
    distanciel: 'Distanciel',
    hybride: 'Hybride',
    afest: 'AFEST',
  } as Record<string, string>)[m] ?? m;
}
