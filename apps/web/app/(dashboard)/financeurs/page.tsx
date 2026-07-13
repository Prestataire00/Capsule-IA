// ARCHETYPE: command
// Justification: carnet financeurs — KPIs + grille par type, montants financés réels (dossier_funders).

import Link from 'next/link';
import { Plus, Wallet, Building2, CreditCard, Briefcase, Globe, ArrowUpRight, TrendingUp } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { getFundersOverview } from '@/features/funders/funders-overview.query';
import { formatEurosCents } from '@/features/funders/funders-overview';
import { ManageOnly } from '@/shared/components/auth/manage-only';

export const dynamic = 'force-dynamic';

const kindStyles: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  opco: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: Building2, label: 'OPCO' },
  cpf: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: CreditCard, label: 'CPF' },
  pole_emploi: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: Briefcase, label: 'France Travail' },
  region: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: Globe, label: 'Région' },
  faf_ca: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: Briefcase, label: 'FAF-CA' },
  agefiph: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400', icon: Wallet, label: 'AGEFIPH' },
  autofinancement: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', icon: Wallet, label: 'Autofinancement' },
  entreprise: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400', icon: Building2, label: 'Entreprise' },
  autre: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', icon: Wallet, label: 'Autre' },
};

export default async function FinanceursPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const overview = await getFundersOverview(supabaseServer());

  const activeKind = searchParams.kind && kindStyles[searchParams.kind] ? searchParams.kind : null;
  const funders = activeKind ? overview.funders.filter((f) => f.kind === activeKind) : overview.funders;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Financeurs</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {overview.totalFunders} financeur{overview.totalFunders > 1 ? 's' : ''} configuré{overview.totalFunders > 1 ? 's' : ''} dans votre OF.
          </p>
        </div>
        <ManageOnly section="catalogue">
        <Link
          href="/financeurs/nouveau"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau financeur
        </Link>
        </ManageOnly>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total financeurs" value={overview.totalFunders} icon={Wallet} accent="violet" href="/financeurs" />
        <StatCard label="OPCO" value={overview.byKind['opco'] ?? 0} icon={Building2} accent="violet" hint="organismes paritaires" hintTone="neutral" href="/financeurs?kind=opco" />
        <StatCard label="CPF" value={overview.byKind['cpf'] ?? 0} icon={CreditCard} accent="blue" hint="financement individuel" hintTone="neutral" href="/financeurs?kind=cpf" />
        <StatCard label="Total financé" value={formatEurosCents(overview.grandTotalCents)} icon={TrendingUp} accent="emerald" />
      </section>

      {activeKind && (
        <div className="flex items-center gap-2 mb-4 text-[13px]">
          <span className="text-zinc-500 dark:text-zinc-400">
            Filtré sur <span className="font-medium text-zinc-700 dark:text-zinc-300">{kindStyles[activeKind]!.label}</span>
          </span>
          <Link href="/financeurs" className="inline-flex items-center gap-1 text-orange-600 hover:underline">
            ✕ Tout afficher
          </Link>
        </div>
      )}

      {funders.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-zinc-400 border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          Aucun financeur configuré. <Link href="/financeurs/nouveau" className="text-orange-600 hover:underline">En ajouter un</Link>.
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funders.map((f) => {
            const k = kindStyles[f.kind] ?? kindStyles['autre']!;
            const Icon = k.icon;
            return (
              <li key={f.id}>
                <Link
                  href={`/financeurs/${f.id}`}
                  className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${k.bg}`}>
                      <Icon className={`w-5 h-5 ${k.text}`} />
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                  </div>

                  <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-1 truncate">{f.name}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-block ${k.bg} ${k.text}`}>{k.label}</span>
                  {f.contactEmail && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">{f.contactEmail}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div>
                      <p className="text-[10px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">Dossiers actifs</p>
                      <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{f.dossierCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">Financé</p>
                      <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums truncate">{formatEurosCents(f.fundedCents)}</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
