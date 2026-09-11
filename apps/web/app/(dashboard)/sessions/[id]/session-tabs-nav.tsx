'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';

const tabs = [
  { slug: '', label: 'Vue' },
  { slug: 'apprenants', label: 'Apprenants' },
  { slug: 'emargements', label: 'Émargements' },
  { slug: 'heures', label: 'Heures' },
  { slug: 'documents', label: 'Documents' },
  { slug: 'questionnaires', label: 'Questionnaires' },
  { slug: 'qualiopi', label: 'Qualiopi' },
  { slug: 'facturation', label: 'Facturation' },
  { slug: 'financeurs', label: 'Financeurs' },
  { slug: 'depenses', label: 'Dépenses' },
  { slug: 'activite', label: 'Activité' },
  { slug: 'acces', label: 'Accès' },
];

export function SessionTabsNav({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();
  return (
    <nav
      role="tablist"
      className="border-b border-zinc-200/70 dark:border-zinc-800 flex items-center gap-1 -mx-1 overflow-x-auto scrollbar-hide"
    >
      {tabs.map((t) => {
        const href = t.slug ? `${baseHref}/${t.slug}` : baseHref;
        const active = t.slug ? pathname.startsWith(href) : pathname === baseHref;
        return (
          <Link
            key={t.slug}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              'text-[13px] px-3 py-2.5 -mb-px border-b-2 transition-colors whitespace-nowrap',
              active
                ? 'text-zinc-900 dark:text-zinc-100 border-orange-500 font-bold'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent font-medium hover:text-zinc-900 dark:hover:text-zinc-100',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
