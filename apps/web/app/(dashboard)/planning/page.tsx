// ARCHETYPE: command
// Justification: planning calendaire des sessions — vue semaine dense, events colorés par formation, scan rapide.

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Filter } from 'lucide-react';

type Event = {
  day: number;        // 0 = lundi, 4 = vendredi
  startHour: number;  // ex 10 pour 10:00
  duration: number;   // en heures
  title: string;
  learner: string;
  tone: 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';
};

const events: Event[] = [
  { day: 0, startHour: 10, duration: 2, title: 'IA Générative', learner: 'Thomas Martin', tone: 'violet' },
  { day: 0, startHour: 14, duration: 2, title: 'IA Générative', learner: 'Thomas Martin', tone: 'violet' },
  { day: 1, startHour: 10, duration: 2, title: 'Prompt Engineering', learner: 'Sophie Bernard', tone: 'blue' },
  { day: 1, startHour: 14, duration: 2, title: 'Prompt Engineering', learner: 'Sophie Bernard', tone: 'blue' },
  { day: 2, startHour: 10, duration: 2, title: 'Data Analyse', learner: 'Julien Moreau', tone: 'emerald' },
  { day: 2, startHour: 14, duration: 2, title: 'Data Analyse', learner: 'Julien Moreau', tone: 'emerald' },
  { day: 3, startHour: 10, duration: 2, title: 'Automatisation', learner: 'Camille Petit', tone: 'amber' },
  { day: 3, startHour: 14, duration: 2, title: 'Automatisation', learner: 'Camille Petit', tone: 'amber' },
  { day: 4, startHour: 10, duration: 2, title: 'IA Générative', learner: 'Thomas Martin', tone: 'violet' },
  { day: 4, startHour: 14, duration: 2, title: 'IA Générative', learner: 'Thomas Martin', tone: 'violet' },
];

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const DAYS = [
  { label: 'Lun.', date: 12 },
  { label: 'Mar.', date: 13 },
  { label: 'Mer.', date: 14 },
  { label: 'Jeu.', date: 15 },
  { label: 'Ven.', date: 16 },
];

const toneStyles: Record<Event['tone'], string> = {
  violet: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200/60 dark:border-violet-900/50 text-violet-900 dark:text-violet-200',
  blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-900/50 text-blue-900 dark:text-blue-200',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200',
  amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-900/50 text-amber-900 dark:text-amber-200',
  rose: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/50 text-rose-900 dark:text-rose-200',
};

const legend = [
  { label: 'En cours', tone: 'emerald' as const },
  { label: 'Planifiée', tone: 'violet' as const },
  { label: 'Terminée', tone: 'zinc' as const },
  { label: 'Annulée', tone: 'rose' as const },
];

const dotColors: Record<string, string> = {
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  zinc: 'bg-zinc-400',
  rose: 'bg-rose-500',
};

export default function PlanningPage() {
  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Planning</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Vue d'ensemble des sessions de formation cette semaine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            Formateur
          </button>
          <button className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />
            Nouvelle session
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        {/* Sélecteur Mois / Semaine / Jour */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <button aria-label="Semaine précédente" className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Mai 2026</p>
            <button aria-label="Semaine suivante" className="w-8 h-8 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5">
            <button className="text-[12px] text-zinc-600 dark:text-zinc-400 px-3 py-1 rounded hover:text-zinc-900 dark:hover:text-zinc-100 transition">Jour</button>
            <button className="text-[12px] bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium px-3 py-1 rounded shadow-sm">Semaine</button>
            <button className="text-[12px] text-zinc-600 dark:text-zinc-400 px-3 py-1 rounded hover:text-zinc-900 dark:hover:text-zinc-100 transition">Mois</button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-zinc-200/60 dark:border-zinc-800">
          <div className="border-r border-zinc-200/60 dark:border-zinc-800" />
          {DAYS.map((d) => (
            <div key={d.label} className="px-3 py-3 border-r last:border-r-0 border-zinc-200/60 dark:border-zinc-800">
              <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{d.label}</p>
              <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">{d.date}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <div className="grid grid-cols-[60px_repeat(5,1fr)]">
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="h-16 border-b border-r border-zinc-100 dark:border-zinc-800/60 px-2 py-1">
                  <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{String(h).padStart(2, '0')}:00</p>
                </div>
                {DAYS.map((_, dayIdx) => (
                  <div
                    key={`${h}-${dayIdx}`}
                    className="h-16 border-b border-r last:border-r-0 border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 transition"
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Events overlay */}
          <div className="absolute inset-0 grid grid-cols-[60px_repeat(5,1fr)] pointer-events-none">
            <div />
            {DAYS.map((_, dayIdx) => (
              <div key={dayIdx} className="relative border-r last:border-r-0 border-transparent">
                {events
                  .filter((e) => e.day === dayIdx)
                  .map((e, i) => {
                    const top = (e.startHour - HOURS[0]!) * 64;
                    const height = e.duration * 64 - 4;
                    return (
                      <div
                        key={i}
                        className={`absolute left-1.5 right-1.5 rounded-md border px-2.5 py-1.5 pointer-events-auto cursor-pointer hover:shadow-sm transition ${toneStyles[e.tone]}`}
                        style={{ top, height }}
                      >
                        <p className="text-[12px] font-medium leading-tight truncate">{e.title}</p>
                        <p className="text-[11px] opacity-75 truncate mt-0.5">{e.learner}</p>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center gap-5 flex-wrap">
          {legend.map((l) => (
            <div key={l.label} className="inline-flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${dotColors[l.tone]}`} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
