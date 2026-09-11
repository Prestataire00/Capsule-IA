// ARCHETYPE: command
// Justification: carnet financeurs — chiffres clés + une ligne par financeur, montants financés réels (dossier_funders).

import Link from 'next/link';
import { Plus, Wallet, Building2, CreditCard, Briefcase, Globe, TrendingUp, Eye, X, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { getFundersOverview } from '@/features/funders/funders-overview.query';
import { formatEurosCents } from '@/features/funders/funders-overview';
import { ManageOnly } from '@/shared/components/auth/manage-only';

export const dynamic = 'force-dynamic';

const kindStyles: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  opco: { icon: Building2, label: 'OPCO' },
  cpf: { icon: CreditCard, label: 'CPF' },
  pole_emploi: { icon: Briefcase, label: 'France Travail' },
  region: { icon: Globe, label: 'Région' },
  faf_ca: { icon: Briefcase, label: 'FAF-CA' },
  agefiph: { icon: Wallet, label: 'AGEFIPH' },
  autofinancement: { icon: Wallet, label: 'Autofinancement' },
  entreprise: { icon: Building2, label: 'Entreprise' },
  autre: { icon: Wallet, label: 'Autre' },
};

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_150px_120px_140px_72px] gap-4 px-5';

function KeyFigure({
  label,
  value,
  hint,
  icon: Icon,
  href,
  active,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        {href ? (
          <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-600 transition" />
        ) : (
          <Icon className="w-4 h-4 text-zinc-400" />
        )}
      </div>
      <p className="mt-2 text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 truncate">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </>
  );
  const cls = `group block rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-sm transition ${
    active
      ? 'border-orange-300 dark:border-orange-800 ring-4 ring-orange-500/10'
      : 'border-zinc-200/70 dark:border-zinc-800'
  }`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-orange-200 dark:hover:border-orange-900/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

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
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
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
        <KeyFigure label="Total financeurs" value={overview.totalFunders} icon={Wallet} href="/financeurs" active={!activeKind} />
        <KeyFigure
          label="OPCO"
          value={overview.byKind['opco'] ?? 0}
          icon={Building2}
          hint="organismes paritaires"
          href="/financeurs?kind=opco"
          active={activeKind === 'opco'}
        />
        <KeyFigure
          label="CPF"
          value={overview.byKind['cpf'] ?? 0}
          icon={CreditCard}
          hint="financement individuel"
          href="/financeurs?kind=cpf"
          active={activeKind === 'cpf'}
        />
        <KeyFigure label="Total financé" value={formatEurosCents(overview.grandTotalCents)} icon={TrendingUp} />
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
                    <div className="min-w-0">
                      <Link
                        href={`/financeurs/${f.id}`}
                        className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                      >
                        {f.name}
                      </Link>
                      {f.contactEmail && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{f.contactEmail}</p>}
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <Icon className="w-3.5 h-3.5 text-zinc-400" />
                        {k.label}
                      </span>
                    </div>
                    <div className="text-right text-[14px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{f.dossierCount}</div>
                    <div className="text-right text-[14px] font-bold tabular-nums text-zinc-900 dark:text-zinc-100 truncate">
                      {formatEurosCents(f.fundedCents)}
                    </div>
                    <div className="flex items-center justify-end">
                      <Link
                        href={`/financeurs/${f.id}`}
                        aria-label={`Ouvrir la fiche — ${f.name}`}
                        title="Ouvrir la fiche"
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
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
