'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

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
        className="border-b border-zinc-200/60 dark:border-zinc-800 flex items-center gap-1 -mx-1 overflow-x-auto scrollbar-hide mb-5"
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
                'text-[13px] px-3 py-2 -mb-px border-b-2 transition whitespace-nowrap',
                isActive
                  ? 'text-zinc-900 dark:text-zinc-100 border-zinc-900 dark:border-zinc-100 font-medium'
                  : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300',
              )}
            >
              {t.label}
              {c != null ? <span className="text-zinc-400"> ({c})</span> : null}
            </button>
          );
        })}
      </nav>
      <div>{content[active]}</div>
    </div>
  );
}
