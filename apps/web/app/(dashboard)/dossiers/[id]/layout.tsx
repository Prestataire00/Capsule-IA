// ARCHETYPE: command (sous-shell d'un dossier)
// Justification: vue détaillée d'un dossier avec tabs sticky pour explorer toutes ses dimensions.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import {
  dossiers, learnerFullName, formationTitle, companyName, formatEuros,
} from '@/shared/mock/data';
import { IdPill } from '@/shared/ui/id-pill';
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
    <div className="min-h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        <div className="mb-6">
          <Link
            href="/dossiers"
            className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3 h-3" />
            Tous les dossiers
          </Link>
        </div>

        <header className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-medium font-mono">{dossier.reference}</h1>
              <StatusPill tone={dossierStatusTone(dossier.status)}>
                {dossierStatusLabel(dossier.status)}
              </StatusPill>
            </div>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {learnerFullName(dossier.learnerId)}
              {companyName(dossier.companyId) && (
                <> · <span className="text-zinc-600 dark:text-zinc-300">{companyName(dossier.companyId)}</span></>
              )}
              <> · </>
              <span className="text-zinc-600 dark:text-zinc-300">{formationTitle(dossier.formationId)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Plus d'actions"
              className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-2 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {dossier.status === 'completed' && (
              <button
                type="button"
                className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
              >
                Clôturer
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MiniStat label="Période" value={`${dossier.startDate.slice(8, 10)}/${dossier.startDate.slice(5, 7)} → ${dossier.endDate.slice(8, 10)}/${dossier.endDate.slice(5, 7)}`} />
          <MiniStat label="Heures" value={`${dossier.totalHours} h`} />
          <MiniStat label="Modalité" value={dossier.modality} />
          <MiniStat label="Montant" value={formatEuros(dossier.totalAmountCents)} />
        </section>

        <TabsNav baseHref={`/dossiers/${dossier.id}`} />

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2">
      <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-[13px] font-medium mt-0.5">{value}</p>
    </div>
  );
}
