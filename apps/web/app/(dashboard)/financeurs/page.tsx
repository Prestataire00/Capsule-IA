// ARCHETYPE: command
// Justification: carnet financeurs — chiffres clés + une ligne par financeur, montants financés réels (dossier_funders).

import Link from 'next/link';
import { Plus, Wallet, Building2, CreditCard, Briefcase, Globe, TrendingUp, Eye, X } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { getFundersOverview } from '@/features/funders/funders-overview.query';
import { formatEurosCents } from '@/features/funders/funders-overview';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { KpiCard, ACCENTS, type Accent } from '@/shared/ui/kpi-card';

export const dynamic = 'force-dynamic';

const kindStyles: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; accent: Accent }> = {
  opco: { icon: Building2, label: 'OPCO', accent: 'blue' },
  cpf: { icon: CreditCard, label: 'CPF', accent: 'sky' },
  pole_emploi: { icon: Briefcase, label: 'France Travail', accent: 'purple' },
  region: { icon: Globe, label: 'Région', accent: 'teal' },
  faf_ca: { icon: Briefcase, label: 'FAF-CA', accent: 'purple' },
  agefiph: { icon: Wallet, label: 'AGEFIPH', accent: 'rose' },
  autofinancement: { icon: Wallet, label: 'Autofinancement', accent: 'orange' },
  entreprise: { icon: Building2, label: 'Entreprise', accent: 'blue' },
  autre: { icon: Wallet, label: 'Autre', accent: 'emerald' },
};

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_150px_120px_140px_108px] gap-4 px-5';

const ACTIVE_RING = 'ring-4 ring-orange-500/15';

export default async function FinanceursPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const overview = await getFundersOverview(supabaseServer());

  const activeKind = searchParams.kind && kindStyles[searchParams.kind] ? searchParams.kind : null;
  const funders = activeKind ? overview.funders.filter((f) => f.kind === activeKind) : overview.funders;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Relations</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Financeurs</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            <span className="tabular-nums">
              {overview.totalFunders} financeur{overview.totalFunders > 1 ? 's' : ''}
            </span>{' '}
            configuré{overview.totalFunders > 1 ? 's' : ''} dans votre OF.
          </p>
        </div>
        <ManageOnly section="catalogue">
          <Link
            href="/financeurs/nouveau"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau financeur
          </Link>
        </ManageOnly>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total financeurs"
          value={overview.totalFunders}
          icon={Wallet}
          accent="emerald"
          href="/financeurs"
          className={!activeKind ? ACTIVE_RING : undefined}
        />
        <KpiCard
          label="OPCO"
          value={overview.byKind['opco'] ?? 0}
          icon={Building2}
          accent="blue"
          hint="organismes paritaires"
          href="/financeurs?kind=opco"
          className={activeKind === 'opco' ? ACTIVE_RING : undefined}
        />
        <KpiCard
          label="CPF"
          value={overview.byKind['cpf'] ?? 0}
          icon={CreditCard}
          accent="sky"
          hint="financement individuel"
          href="/financeurs?kind=cpf"
          className={activeKind === 'cpf' ? ACTIVE_RING : undefined}
        />
        <KpiCard label="Total financé" value={<span className="block truncate">{formatEurosCents(overview.grandTotalCents)}</span>} icon={TrendingUp} accent="emerald" />
      </section>

      {activeKind && (
        <div className="flex items-center gap-2 mb-4 text-[13px]">
          <span className="text-zinc-500 dark:text-zinc-400">
            Filtré sur <span className="font-semibold text-zinc-700 dark:text-zinc-300">{kindStyles[activeKind]!.label}</span>
          </span>
          <Link
            href="/financeurs"
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition"
          >
            <X className="w-3.5 h-3.5" /> Tout afficher
          </Link>
        </div>
      )}

      {funders.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-zinc-400 bg-white dark:bg-zinc-900 border border-dashed border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          Aucun financeur configuré.{' '}
          <Link href="/financeurs/nouveau" className="text-orange-600 dark:text-orange-400 hover:underline">
            En ajouter un
          </Link>
          .
        </p>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}
            >
              <div>Financeur</div>
              <div>Type</div>
              <div className="text-right">Dossiers actifs</div>
              <div className="text-right">Financé</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {funders.map((f) => {
                const k = kindStyles[f.kind] ?? kindStyles['autre']!;
                const Icon = k.icon;
                return (
                  <li key={f.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${ACCENTS.emerald.soft}`}>
                        <Wallet className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/financeurs/${f.id}`}
                          className="block truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          {f.name}
                        </Link>
                        {f.contactEmail && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{f.contactEmail}</p>}
                      </div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS[k.accent].soft}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {k.label}
                      </span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${
                          f.dossierCount > 0 ? ACCENTS.blue.soft : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {f.dossierCount}
                      </span>
                    </div>
                    <div className={`text-right text-[15px] font-bold tabular-nums truncate ${f.fundedCents > 0 ? ACCENTS.emerald.value : 'text-zinc-400'}`}>
                      {formatEurosCents(f.fundedCents)}
                    </div>
                    <div className="flex items-center justify-end gap-0.5">
                      <Link
                        href={`/financeurs/${f.id}`}
                        aria-label={`Ouvrir la fiche — ${f.name}`}
                        title="Ouvrir la fiche"
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <ManageOnly section="catalogue">
                        <DeleteEntityButton
                          entite="financeur"
                          id={f.id}
                          nom={f.name}
                          article="ce financeur"
                          liens={f.dossierCount > 0 ? `${f.dossierCount} dossier${f.dossierCount > 1 ? 's' : ''} y ${f.dossierCount > 1 ? 'sont' : 'est'} rattaché${f.dossierCount > 1 ? 's' : ''}.` : null}
                        />
                      </ManageOnly>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
