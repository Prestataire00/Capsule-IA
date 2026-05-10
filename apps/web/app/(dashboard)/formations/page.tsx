// ARCHETYPE: command
// Justification: vue catalogue formations — KPIs, grille avec icône colorée par modalité, durée, prix, statut.

import Link from 'next/link';
import { Plus, Search, GraduationCap, BookOpen, Eye, EyeOff, Clock, Video, MapPin, Users as UsersIcon, ArrowUpRight } from 'lucide-react';
import { formations, dossiers } from '@/shared/mock/data';
import { StatCard } from '@/shared/ui/stat-card';

const modalityStyles = {
  presentiel: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: MapPin, label: 'Présentiel' },
  distanciel: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: Video, label: 'Distanciel' },
  hybride: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: GraduationCap, label: 'Hybride' },
  afest: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: BookOpen, label: 'AFEST' },
};

export default function FormationsPage() {
  const published = formations.filter((f) => f.isPublished).length;
  const draft = formations.length - published;
  const totalSessions = dossiers.reduce((acc, d) => acc + d.sessionsCount, 0);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Formations</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Catalogue de {formations.length} formations dans votre OF.
          </p>
        </div>
        <Link
          href="/formations/nouvelle"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle formation
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total formations" value={formations.length} icon={BookOpen} accent="violet" />
        <StatCard label="Publiées" value={published} icon={Eye} accent="emerald" hint="visibles au catalogue" hintTone="success" />
        <StatCard label="Brouillons" value={draft} icon={EyeOff} accent="amber" hint={draft > 0 ? 'à publier' : '—'} hintTone={draft > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Sessions cette année" value={totalSessions} icon={Clock} accent="blue" hint="↑ 18% vs 2025" hintTone="success" />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            placeholder="Rechercher une formation, un code…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-2">Modalité :</span>
          <button className="bg-violet-600 text-white px-2.5 py-1 rounded-md font-medium">Toutes</button>
          <button className="text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition">Présentiel</button>
          <button className="text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition">Distanciel</button>
          <button className="text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition">Hybride</button>
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {formations.map((f) => {
          const m = modalityStyles[f.modality];
          const Icon = m.icon;
          const enrolled = dossiers.filter((d) => d.formationId === f.id && (d.status === 'active' || d.status === 'scheduled')).length;
          return (
            <li key={f.id}>
              <Link
                href="#"
                className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${m.bg}`}>
                    <Icon className={`w-5 h-5 ${m.text}`} />
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                </div>

                <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mb-1">{f.code}</p>
                <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3 line-clamp-2">
                  {f.title}
                </p>

                <div className="flex items-center gap-3 text-[12px] text-zinc-600 dark:text-zinc-400 mb-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {f.defaultHours} h
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {m.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <span className={
                    f.isPublished
                      ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1'
                      : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 inline-flex items-center gap-1'
                  }>
                    {f.isPublished ? (
                      <><Eye className="w-2.5 h-2.5" /> publiée</>
                    ) : (
                      <><EyeOff className="w-2.5 h-2.5" /> brouillon</>
                    )}
                  </span>
                  {enrolled > 0 && (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono inline-flex items-center gap-1">
                      <UsersIcon className="w-3 h-3" />
                      {enrolled} apprenant{enrolled > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
