// ARCHETYPE: shared (command)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';

const tabs = [
  { slug: '', label: 'Vue' },
  { slug: 'modules', label: 'Modules' },
  { slug: 'sessions', label: 'Sessions' },
  { slug: 'emargements', label: 'Émargements' },
  { slug: 'documents', label: 'Documents' },
  { slug: 'questionnaires', label: 'Questionnaires' },
  { slug: 'qualiopi', label: 'Qualiopi' },
  { slug: 'facturation', label: 'Facturation' },
  { slug: 'financeurs', label: 'Financeurs' },
  { slug: 'acces-apprenant', label: 'Accès apprenant' },
];

export function TabsNav({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();
  return (
    <nav
      role="tablist"
      className="border-b border-zinc-200/60 dark:border-zinc-800 flex items-center gap-1 -mx-1 overflow-x-auto"
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
              'text-[13px] px-3 py-2 -mb-px border-b-2 transition whitespace-nowrap',
              active
                ? 'text-zinc-900 dark:text-zinc-100 border-zinc-900 dark:border-zinc-100 font-medium'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
