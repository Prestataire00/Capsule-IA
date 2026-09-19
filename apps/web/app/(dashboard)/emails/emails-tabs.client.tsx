'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { History, Zap } from 'lucide-react';

// Deux questions distinctes : « qu'est-ce qui est parti ? » (le journal) et
// « qu'est-ce qui part tout seul, et quand ? » (le catalogue).
const TABS = [
  { href: '/emails', label: 'Historique', icon: History, iconCls: 'text-sky-500 dark:text-sky-400' },
  { href: '/emails/automatiques', label: 'Envois automatiques', icon: Zap, iconCls: 'text-amber-500 dark:text-amber-400' },
];

export function EmailsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 mb-6">
      {TABS.map((t) => {
        const active = pathname === t.href;
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
