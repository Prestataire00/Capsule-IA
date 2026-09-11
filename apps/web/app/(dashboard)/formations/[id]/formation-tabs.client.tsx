'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { ACCENTS } from '@/shared/ui/kpi-card';

type TabKey = 'overview' | 'sessions' | 'dossiers' | 'budget' | 'stats' | 'qualiopi';

export function FormationTabs({
  counts,
  overview,
  sessions,
  dossiers,
  budget,
  stats,
  qualiopi,
}: {
  counts?: Partial<Record<TabKey, number>>;
  overview: React.ReactNode;
  sessions: React.ReactNode;
  dossiers: React.ReactNode;
  budget: React.ReactNode;
  stats: React.ReactNode;
  qualiopi: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>('overview');

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: "Vue d'ensemble" },
    { key: 'sessions', label: 'Sessions' },
    { key: 'dossiers', label: 'Dossiers' },
    { key: 'budget', label: 'Budget & charges' },
    { key: 'stats', label: 'Statistiques' },
    { key: 'qualiopi', label: 'Qualiopi' },
  ];

  const content: Record<TabKey, React.ReactNode> = { overview, sessions, dossiers, budget, stats, qualiopi };

  return (
    <div>
      <nav
        role="tablist"
        className="border-b border-zinc-200/70 dark:border-zinc-800 flex items-center gap-1 -mx-1 overflow-x-auto scrollbar-hide mb-5"
      >
        {TABS.map((t) => {
          const isActive = active === t.key;
          const c = counts?.[t.key];
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={cn(
                'text-[13px] px-3 py-2.5 -mb-px border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'text-zinc-900 dark:text-zinc-100 border-orange-500 font-bold'
                  : 'text-zinc-500 dark:text-zinc-400 border-transparent font-medium hover:text-zinc-900 dark:hover:text-zinc-100',
              )}
            >
              {t.label}
              {c != null ? (
                <span
                  className={cn(
                    'ml-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums',
                    isActive ? ACCENTS.orange.soft : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                  )}
                >
                  {c}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div>{content[active]}</div>
    </div>
  );
}
