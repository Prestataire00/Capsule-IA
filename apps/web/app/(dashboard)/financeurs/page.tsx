// ARCHETYPE: command
// Justification: vue carnet financeurs — KPIs + grille avec icônes par type, montants financés.

import Link from 'next/link';
import { Plus, Search, Wallet, Building2, CreditCard, Briefcase, Globe, ArrowUpRight, TrendingUp } from 'lucide-react';
import { funders, dossiers, formatEuros } from '@/shared/mock/data';
import { StatCard } from '@/shared/ui/stat-card';

const kindStyles: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  opco: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: Building2, label: 'OPCO' },
  cpf: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: CreditCard, label: 'CPF' },
  pole_emploi: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: Briefcase, label: 'France Travail' },
  region: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: Globe, label: 'Région' },
  autofinancement: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', icon: Wallet, label: 'Autofinancement' },
  entreprise: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400', icon: Building2, label: 'Entreprise' },
  autre: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', icon: Wallet, label: 'Autre' },
};

export default function FinanceursPage() {
  const opcoCount = funders.filter((f) => f.kind === 'opco').length;
  const cpfCount = funders.filter((f) => f.kind === 'cpf').length;

  // Calcul total financé par chaque financeur
  const fundedByFunder = funders.map((f) => {
    const total = dossiers
      .filter((d) => d.funderId === f.id && (d.status === 'active' || d.status === 'completed' || d.status === 'closed'))
      .reduce((acc, d) => acc + (d.totalAmountCents ?? 0), 0);
    const count = dossiers.filter((d) => d.funderId === f.id && (d.status === 'active' || d.status === 'scheduled')).length;
    return { ...f, total, count };
  });
  const grandTotal = fundedByFunder.reduce((acc, f) => acc + f.total, 0);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Financeurs</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {funders.length} financeurs configurés dans votre OF.
          </p>
        </div>
        <Link
          href="/financeurs/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau financeur
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total financeurs" value={funders.length} icon={Wallet} accent="violet" />
        <StatCard label="OPCO" value={opcoCount} icon={Building2} accent="violet" hint="organismes paritaires" hintTone="neutral" />
        <StatCard label="CPF" value={cpfCount} icon={CreditCard} accent="blue" hint="financement individuel" hintTone="neutral" />
        <StatCard label="Total financé 2026" value={formatEuros(grandTotal)} icon={TrendingUp} accent="emerald" hint="↑ 12% vs 2025" hintTone="success" />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            placeholder="Rechercher un financeur…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fundedByFunder.map((f) => {
          const k = kindStyles[f.kind] ?? kindStyles.autre;
          const Icon = k.icon;
          return (
            <li key={f.id}>
              <Link
                href="#"
                className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${k.bg}`}>
                    <Icon className={`w-5 h-5 ${k.text}`} />
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                </div>

                <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-1 truncate">
                  {f.name}
                </p>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-block ${k.bg} ${k.text}`}>
                  {k.label}
                </span>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div>
                    <p className="text-[10px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">Dossiers actifs</p>
                    <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{f.count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">Financé 2026</p>
                    <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums truncate">{formatEuros(f.total)}</p>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
