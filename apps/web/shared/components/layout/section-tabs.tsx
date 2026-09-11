// ARCHETYPE: shared (onglets de la section courante, sous la barre du haut — charte v4)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { can, sectionForPath } from '@/shared/lib/auth/permissions';
import { GROUPS } from './sidebar-rail';

export function SectionTabs({ role }: { role?: string }) {
  const pathname = usePathname();
  const matches = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const group = GROUPS.find((g) => g.items?.some((i) => matches(i.href)));
  const items = (group?.items ?? []).filter((i) => {
    const s = sectionForPath(i.href);
    return s ? can(role, s) !== 'none' : true;
  });
  if (!group || items.length < 2) return null;

  // « /emails » et « /emails/nouveau » correspondent tous deux : l'onglet le plus précis l'emporte.
  const activeHref = items
    .filter((i) => matches(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label={group.label}
      className="h-11 flex-shrink-0 px-6 flex items-stretch gap-6 border-b border-zinc-200/70 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl sticky top-16 z-30 overflow-x-auto scrollbar-hide text-[13px]"
    >
      {items.map((i) => {
        const active = i.href === activeHref;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center whitespace-nowrap border-b-2 transition-colors',
              active
                ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-bold'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100',
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
