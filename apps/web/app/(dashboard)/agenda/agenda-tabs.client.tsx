'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CalendarClock } from 'lucide-react';

// Onglets partagés : Agenda général (Google) + Planning des sessions.
const TABS = [
  { href: '/agenda', label: 'Agenda général', icon: CalendarDays },
  { href: '/planning', label: 'Sessions', icon: CalendarClock },
];

export function AgendaTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/60 dark:border-zinc-800 mb-6">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? 'inline-flex items-center gap-2 text-[13px] font-medium text-violet-700 dark:text-violet-400 border-b-2 border-violet-600 px-3 py-2.5 -mb-px'
                : 'inline-flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2.5 transition'
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
