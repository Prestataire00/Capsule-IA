// ARCHETYPE: shared (sidebar avec labels — style Notion/Linear)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderOpen, GraduationCap, Users, UserCog, Building2,
  Calendar, FileText, ClipboardList, ClipboardCheck, Wallet, Receipt,
  MessageSquareWarning, Settings, ChevronRight,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { currentUser } from '@/shared/mock/data';

type Item = { href: string; icon: React.ComponentType<{ className?: string }>; label: string };

const items: Item[] = [
  { href: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/dossiers', icon: FolderOpen, label: 'Dossiers' },
  { href: '/formations', icon: GraduationCap, label: 'Formations' },
  { href: '/apprenants', icon: Users, label: 'Apprenants' },
  { href: '/formateurs', icon: UserCog, label: 'Formateurs' },
  { href: '/entreprises', icon: Building2, label: 'Entreprises' },
  { href: '/planning', icon: Calendar, label: 'Planning' },
  { href: '/documents', icon: FileText, label: 'Documents' },
  { href: '/emargements', icon: ClipboardCheck, label: 'Émargements' },
  { href: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
  { href: '/financeurs', icon: Wallet, label: 'Financeurs' },
  { href: '/factures', icon: Receipt, label: 'Facturation' },
  { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
  { href: '/parametres', icon: Settings, label: 'Paramètres' },
];

export function SidebarRail() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const initials = currentUser.full_name.split(' ').map((s) => s[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className="w-60 flex-shrink-0 border-r border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      <div className="px-4 py-5 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center font-mono text-[13px] font-medium shadow-sm">
          ia
        </span>
        <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">infinity</p>
      </div>

      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition',
                    active
                      ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-violet-600 dark:text-violet-400' : '')} />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href="/parametres"
        className="px-3 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition group"
      >
        <span className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[11px] flex items-center justify-center flex-shrink-0">
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{currentUser.full_name}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize truncate">{currentUser.role === 'owner' ? 'Administratrice' : currentUser.role}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 transition flex-shrink-0" />
      </Link>
    </aside>
  );
}
