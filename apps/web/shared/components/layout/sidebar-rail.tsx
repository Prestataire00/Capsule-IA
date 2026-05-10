// ARCHETYPE: shared (utilisé en command)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, FolderOpen, Users, Building2, GraduationCap, UserCog, Wallet,
  ShieldCheck, Receipt, MessageSquareWarning, Activity, Settings,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const items = [
  { href: '/', icon: Home, label: 'Accueil' },
  { href: '/dossiers', icon: FolderOpen, label: 'Dossiers' },
  { href: '/apprenants', icon: Users, label: 'Apprenants' },
  { href: '/entreprises', icon: Building2, label: 'Entreprises' },
  { href: '/formations', icon: GraduationCap, label: 'Formations' },
  { href: '/formateurs', icon: UserCog, label: 'Formateurs' },
  { href: '/financeurs', icon: Wallet, label: 'Financeurs' },
  { href: '/qualiopi', icon: ShieldCheck, label: 'Qualiopi' },
  { href: '/factures', icon: Receipt, label: 'Factures' },
  { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
  { href: '/audit', icon: Activity, label: 'Audit' },
  { href: '/parametres', icon: Settings, label: 'Paramètres' },
];

export function SidebarRail() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="w-12 flex-shrink-0 border-r border-zinc-200/60 dark:border-zinc-800 flex flex-col items-center py-3 gap-0.5 bg-white dark:bg-zinc-950">
      <div className="w-7 h-7 mb-3 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-mono text-[11px] font-medium">
        ia
      </div>
      {items.map(({ href, icon: Icon, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className={cn(
              'w-8 h-8 rounded flex items-center justify-center transition',
              active
                ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300',
            )}
          >
            <Icon className="w-4 h-4" />
          </Link>
        );
      })}
    </nav>
  );
}
