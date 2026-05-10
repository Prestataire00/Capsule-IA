// ARCHETYPE: shared (utilisé en command)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, FolderOpen, Users, Building2, GraduationCap, UserCog, Wallet,
  ShieldCheck, Receipt, MessageSquareWarning, Activity, Settings,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Item = { href: string; icon: React.ComponentType<{ className?: string }>; label: string };

const sections: { items: Item[] }[] = [
  {
    items: [
      { href: '/', icon: Home, label: 'Accueil' },
      { href: '/dossiers', icon: FolderOpen, label: 'Dossiers' },
    ],
  },
  {
    items: [
      { href: '/apprenants', icon: Users, label: 'Apprenants' },
      { href: '/entreprises', icon: Building2, label: 'Entreprises' },
      { href: '/formations', icon: GraduationCap, label: 'Formations' },
      { href: '/formateurs', icon: UserCog, label: 'Formateurs' },
      { href: '/financeurs', icon: Wallet, label: 'Financeurs' },
    ],
  },
  {
    items: [
      { href: '/qualiopi', icon: ShieldCheck, label: 'Qualiopi' },
      { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
      { href: '/audit', icon: Activity, label: 'Audit' },
    ],
  },
  {
    items: [
      { href: '/factures', icon: Receipt, label: 'Factures' },
    ],
  },
];

const settings: Item = { href: '/parametres', icon: Settings, label: 'Paramètres' };

export function SidebarRail() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav className="w-14 flex-shrink-0 border-r border-zinc-200/60 dark:border-zinc-800 flex flex-col items-center py-4 bg-white dark:bg-zinc-950 gap-1">
      <Link
        href="/"
        aria-label="Accueil"
        className="w-9 h-9 mb-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-mono text-[13px] font-medium"
      >
        ia
      </Link>
      <div className="flex-1 flex flex-col items-center gap-3 w-full">
        {sections.map((section, idx) => (
          <div key={idx} className="flex flex-col items-center gap-0.5 w-full">
            {idx > 0 && <div className="w-6 h-px bg-zinc-200/60 dark:bg-zinc-800 mb-2" />}
            {section.items.map(({ href, icon: Icon, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  className={cn(
                    'group relative w-9 h-9 rounded-lg flex items-center justify-center transition',
                    active
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <Link
        href={settings.href}
        aria-label={settings.label}
        className={cn(
          'group relative w-9 h-9 rounded-lg flex items-center justify-center transition',
          isActive(settings.href)
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
        )}
      >
        <settings.icon className="w-4 h-4" />
        <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
          {settings.label}
        </span>
      </Link>
    </nav>
  );
}
