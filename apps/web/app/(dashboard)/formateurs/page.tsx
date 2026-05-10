// ARCHETYPE: command
// Justification: vue carnet formateurs — KPIs, grille de cards avec spécialités et nb dossiers.

import Link from 'next/link';
import { Plus, Search, UserCog, Building, Briefcase, Star, Mail, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { trainers, dossiers } from '@/shared/mock/data';
import { StatCard } from '@/shared/ui/stat-card';

const palette = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
];

export default function FormateursPage() {
  const internal = trainers.filter((t) => t.isInternal).length;
  const external = trainers.filter((t) => !t.isInternal).length;
  const sessionsThisWeek = 12; // mock

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Formateurs</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {trainers.length} formateurs dans votre réseau.
          </p>
        </div>
        <Link
          href="/formateurs/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau formateur
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total formateurs" value={trainers.length} icon={UserCog} accent="violet" />
        <StatCard label="Internes" value={internal} icon={Building} accent="emerald" hint={`${Math.round((internal / Math.max(trainers.length, 1)) * 100)}% de l'équipe`} hintTone="neutral" />
        <StatCard label="Externes" value={external} icon={Briefcase} accent="blue" hint="freelances" hintTone="neutral" />
        <StatCard label="Sessions cette semaine" value={sessionsThisWeek} icon={Star} accent="amber" hint="↑ 3 vs semaine dernière" hintTone="success" />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            placeholder="Rechercher un formateur, une spécialité…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-2">Filtre :</span>
          <button className="bg-violet-600 text-white px-2.5 py-1 rounded-md font-medium">Tous</button>
          <button className="text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition">Internes</button>
          <button className="text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition">Externes</button>
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trainers.map((t) => {
          const initials = `${t.firstName[0]}${t.lastName[0]}`.toUpperCase();
          const idx = (t.firstName.charCodeAt(0) + t.lastName.charCodeAt(0)) % palette.length;
          const myDossiers = dossiers.filter((d) => d.trainerIds.includes(t.id) && (d.status === 'active' || d.status === 'scheduled')).length;
          return (
            <li key={t.id}>
              <Link
                href="#"
                className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-medium flex-shrink-0 shadow-sm ${palette[idx]}`}>
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {t.firstName} {t.lastName}
                        </p>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Compétences vérifiées" />
                      </div>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {t.email}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[24px]">
                  {t.specialties.map((s) => (
                    <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {s}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <span className={
                    t.isInternal
                      ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                  }>
                    {t.isInternal ? 'Interne' : 'Externe'}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                    {myDossiers} dossier{myDossiers > 1 ? 's' : ''} actif{myDossiers > 1 ? 's' : ''}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
