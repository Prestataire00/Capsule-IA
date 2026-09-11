'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CalendarClock } from 'lucide-react';

// Onglets partagés : Agenda général (Google) + Planning des sessions.
const TABS = [
  { href: '/agenda', label: 'Agenda général', icon: CalendarDays, iconCls: 'text-blue-500 dark:text-blue-400' },
  { href: '/planning', label: 'Sessions', icon: CalendarClock, iconCls: 'text-orange-500 dark:text-orange-400' },
];

export function AgendaTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 mb-6">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? 'inline-flex items-center gap-2 text-[13px] font-bold text-orange-700 dark:text-orange-300 border-b-2 border-orange-500 px-3 py-2.5 -mb-px'
                : 'inline-flex items-center gap-2 text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2.5 transition'
            }
          >
            <Icon className={`w-3.5 h-3.5 ${t.iconCls}`} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
