// ARCHETYPE: shared (sidebar dynamique : sections + badges + CTA + récents)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderOpen, GraduationCap, Users, UserCog, Building2,
  Calendar, FileText, ClipboardList, ClipboardCheck, Wallet, Receipt,
  MessageSquareWarning, Settings, ChevronRight, Plus, Activity, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';
import { currentUser, dossiers, learnerFullName } from '@/shared/mock/data';

type Item = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: { count: number; tone: 'violet' | 'amber' | 'rose' | 'emerald' };
};

const sections: { title: string; items: Item[] }[] = [
  {
    title: 'Principal',
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
      { href: '/dossiers', icon: FolderOpen, label: 'Dossiers' },
      { href: '/planning', icon: Calendar, label: 'Planning' },
    ],
  },
  {
    title: 'Carnet',
    items: [
      { href: '/apprenants', icon: Users, label: 'Apprenants' },
      { href: '/formateurs', icon: UserCog, label: 'Formateurs' },
      { href: '/entreprises', icon: Building2, label: 'Entreprises' },
      { href: '/formations', icon: GraduationCap, label: 'Formations' },
      { href: '/financeurs', icon: Wallet, label: 'Financeurs' },
    ],
  },
  {
    title: 'Suivi',
    items: [
      { href: '/documents', icon: FileText, label: 'Documents' },
      { href: '/emargements', icon: ClipboardCheck, label: 'Émargements' },
      { href: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
      { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
      { href: '/factures', icon: Receipt, label: 'Facturation' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/qualiopi', icon: ShieldCheck, label: 'Qualiopi' },
      { href: '/audit', icon: Activity, label: 'Audit' },
      { href: '/parametres', icon: Settings, label: 'Paramètres' },
    ],
  },
];

const badgeStyles = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
};

const palette = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
];

const recentDossiers = dossiers.slice(0, 3);

export type SidebarCounts = {
  reclamationsActive?: number;
  emargementsPending?: number;
  questionnairesActive?: number;
  invoicesUnpaid?: number;
};

const COUNT_BY_HREF: Record<string, { key: keyof SidebarCounts; tone: keyof typeof badgeStyles }> = {
  '/reclamations': { key: 'reclamationsActive', tone: 'rose' },
  '/emargements': { key: 'emargementsPending', tone: 'amber' },
  '/questionnaires': { key: 'questionnairesActive', tone: 'violet' },
  '/factures': { key: 'invoicesUnpaid', tone: 'amber' },
};

export function SidebarRail({ counts }: { counts?: SidebarCounts } = {}) {
  const pathname = usePathname();

  const dynamicBadgeFor = (href: string): { count: number; tone: keyof typeof badgeStyles } | null => {
    const mapping = COUNT_BY_HREF[href];
    if (!mapping || !counts) return null;
    const value = counts[mapping.key];
    if (!value || value <= 0) return null;
    return { count: value, tone: mapping.tone };
  };
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const userInitials = currentUser.full_name.split(' ').map((s) => s[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Logo brand */}
      <div className="px-4 py-5">
        <Logo size="md" />
      </div>

      {/* CTA Nouveau dossier */}
      <div className="px-3 mb-3">
        <Link
          href="/dossiers/nouveau"
          className="w-full bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-3 py-2 rounded-lg transition shadow-sm inline-flex items-center justify-center gap-2 group"
        >
          <Plus className="w-3.5 h-3.5 transition group-hover:rotate-90" />
          Nouveau dossier
        </Link>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto scrollbar-thin">
        {sections.map((section, sIdx) => (
          <div key={section.title} className={cn('space-y-0.5', sIdx > 0 && 'mt-5')}>
            <p className="px-3 mb-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label }) => {
                const active = isActive(href);
                const badge = dynamicBadgeFor(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition group',
                        active
                          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-600 rounded-r" />
                      )}
                      <Icon
                        className={cn(
                          'w-4 h-4 flex-shrink-0 transition',
                          active
                            ? 'text-violet-600 dark:text-violet-400'
                            : 'group-hover:scale-110 group-hover:text-zinc-700 dark:group-hover:text-zinc-200',
                        )}
                      />
                      <span className="truncate flex-1">{label}</span>
                      {badge && badge.count > 0 && (
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums',
                          badgeStyles[badge.tone],
                        )}>
                          {badge.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Section Récents */}
        <div className="mt-5 space-y-0.5">
          <p className="px-3 mb-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium">
            Récents
          </p>
          <ul className="space-y-0.5">
            {recentDossiers.map((d) => {
              const learnerName = learnerFullName(d.learnerId);
              const inits = learnerName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
              const palIdx = learnerName.charCodeAt(0) % palette.length;
              return (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium flex-shrink-0',
                      palette[palIdx],
                    )}>
                      {inits}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 truncate transition">
                        {learnerName}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
                        {d.reference}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Profil utilisateur en bas */}
      <Link
        href="/parametres"
        className="px-3 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition group"
      >
        <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[12px] flex items-center justify-center flex-shrink-0 shadow-sm">
          {userInitials}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{currentUser.full_name}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize truncate">{currentUser.role === 'owner' ? 'Administrateur' : currentUser.role}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 dark:group-hover:text-violet-400 group-hover:translate-x-0.5 transition flex-shrink-0" />
      </Link>
    </aside>
  );
}
