// ARCHETYPE: command
// Justification: vue carnet entreprises clientes — KPIs, grille avec logo couleur, counts apprenants/dossiers.

import Link from 'next/link';
import { Plus, Search, Building2, Users, FolderOpen, Banknote, MapPin, Mail, ArrowUpRight } from 'lucide-react';
import { companies, learners, dossiers, formatEuros } from '@/shared/mock/data';
import { StatCard } from '@/shared/ui/stat-card';

const palette = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
];

export default function EntreprisesPage() {
  const withActive = companies.filter((c) =>
    dossiers.some((d) => d.companyId === c.id && (d.status === 'active' || d.status === 'scheduled')),
  ).length;
  const learnersInCompanies = learners.filter((l) => l.companyId).length;
  const totalRevenue = dossiers
    .filter((d) => d.companyId && (d.status === 'active' || d.status === 'completed' || d.status === 'closed'))
    .reduce((acc, d) => acc + (d.totalAmountCents ?? 0), 0);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Entreprises</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {companies.length} entreprises clientes dans votre carnet.
          </p>
        </div>
        <Link
          href="/entreprises/nouvelle"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle entreprise
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total entreprises" value={companies.length} icon={Building2} accent="violet" />
        <StatCard label="Avec dossier actif" value={withActive} icon={FolderOpen} accent="emerald" hint={`${Math.round((withActive / Math.max(companies.length, 1)) * 100)}% du carnet`} hintTone="success" />
        <StatCard label="Apprenants liés" value={learnersInCompanies} icon={Users} accent="rose" hint="rattachés à une entreprise" hintTone="neutral" />
        <StatCard label="CA en cours" value={formatEuros(totalRevenue)} icon={Banknote} accent="amber" hint="dossiers actifs/clos" hintTone="success" />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            placeholder="Rechercher une entreprise, SIRET, ville…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((c) => {
          const initials = c.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
          const idx = c.name.charCodeAt(0) % palette.length;
          const myLearners = learners.filter((l) => l.companyId === c.id).length;
          const myActiveDossiers = dossiers.filter((d) => d.companyId === c.id && (d.status === 'active' || d.status === 'scheduled')).length;
          return (
            <li key={c.id}>
              <Link
                href="#"
                className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-[14px] font-semibold flex-shrink-0 shadow-sm ${palette[idx]}`}>
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {c.name}
                      </p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {c.city}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                </div>

                <div className="space-y-1.5 mb-3 text-[12px] text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">SIRET {c.siret}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] tracking-wider uppercase text-rose-600 dark:text-rose-400 font-medium">Apprenants</p>
                    <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{myLearners}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] tracking-wider uppercase text-emerald-600 dark:text-emerald-400 font-medium">Dossiers actifs</p>
                    <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{myActiveDossiers}</p>
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
