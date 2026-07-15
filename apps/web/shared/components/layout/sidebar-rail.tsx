// ARCHETYPE: shared (sidebar dynamique : icon-bar 64px + flyout au hover, inspiré Sosafe)
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderOpen, GraduationCap, Users, UserCog, Building2, Globe,
  Calendar, FileText, ClipboardList, ClipboardCheck, Wallet, Receipt,
  MessageSquareWarning, Settings, Plus, Activity, ShieldCheck,
  Bell, BarChart3, Inbox, Eye, Telescope, CalendarDays, CalendarClock, Mail, Briefcase,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';
import { can, sectionForPath } from '@/shared/lib/auth/permissions';
import { dossiers, learnerFullName } from '@/shared/mock/data';

type Tone = 'violet' | 'amber' | 'rose' | 'emerald' | 'orange';

type Item = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

export type SidebarCounts = {
  reclamationsActive?: number;
  emargementsPending?: number;
  questionnairesActive?: number;
  invoicesUnpaid?: number;
  demandesPending?: number;
};

type Group = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  items?: Item[];
  showRecents?: boolean;
  countKeys?: (keyof SidebarCounts)[];
};

const GROUPS: Group[] = [
  {
    key: 'tableau-de-bord',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Accueil' },
      { href: '/reporting', icon: BarChart3, label: 'Reporting' },
      { href: '/notifications', icon: Bell, label: 'Notifications' },
    ],
  },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays, href: '/agenda' },
  {
    key: 'relations',
    label: 'Relations',
    icon: Users,
    items: [
      { href: '/prospects', icon: Inbox, label: 'Demandes' },
      { href: '/entreprises', icon: Building2, label: 'Entreprises' },
      { href: '/financeurs', icon: Wallet, label: 'Financeurs' },
      { href: '/apprenants', icon: Users, label: 'Apprenants' },
      { href: '/formateurs', icon: UserCog, label: 'Formateurs' },
    ],
    countKeys: ['demandesPending'],
  },
  {
    key: 'formations',
    label: 'Formations',
    icon: GraduationCap,
    items: [
      { href: '/formations', icon: GraduationCap, label: 'Formations' },
      { href: '/catalogue-public', icon: Globe, label: 'Catalogue public' },
      { href: '/dossiers', icon: FolderOpen, label: 'Dossiers' },
      { href: '/fiches-besoin', icon: ClipboardList, label: 'Fiches besoin' },
      { href: '/sessions', icon: CalendarClock, label: 'Sessions' },
      { href: '/planning', icon: Calendar, label: 'Planning' },
      { href: '/emargements', icon: ClipboardCheck, label: 'Émargements' },
    ],
    countKeys: ['emargementsPending'],
  },
  {
    key: 'docs-comm',
    label: 'Documents & Communication',
    icon: FileText,
    items: [
      { href: '/documents', icon: FileText, label: 'Documents' },
      { href: '/emails', icon: Mail, label: 'Emails' },
      { href: '/tracabilite', icon: Eye, label: 'Traçabilité des documents' },
    ],
  },
  {
    key: 'gestion',
    label: 'Gestion administrative',
    icon: Briefcase,
    items: [
      { href: '/factures', icon: Receipt, label: 'Facturation' },
      { href: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
      { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
      { href: '/bpf', icon: FileText, label: 'BPF' },
    ],
    countKeys: ['invoicesUnpaid', 'questionnairesActive', 'reclamationsActive'],
  },
  {
    key: 'qualite',
    label: 'Qualité & Conformité',
    icon: ShieldCheck,
    items: [
      { href: '/qualiopi', icon: ShieldCheck, label: 'Qualiopi' },
      { href: '/audit', icon: Activity, label: 'Audit' },
      { href: '/amelioration-continue', icon: Telescope, label: 'Veille & amélioration' },
    ],
  },
];

const COUNT_BY_HREF: Record<string, { key: keyof SidebarCounts; tone: Tone }> = {
  '/reclamations': { key: 'reclamationsActive', tone: 'rose' },
  '/emargements': { key: 'emargementsPending', tone: 'amber' },
  '/questionnaires': { key: 'questionnairesActive', tone: 'violet' },
  '/factures': { key: 'invoicesUnpaid', tone: 'amber' },
  '/prospects': { key: 'demandesPending', tone: 'rose' },
};

const badgeStyles: Record<Tone, string> = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
};

const avatarPalette = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
];

const recentDossiers = dossiers.slice(0, 3);

export function SidebarRail({
  counts,
  user,
}: { counts?: SidebarCounts; user?: { fullName: string; roleLabel: string; role: string } } = {}) {
  const pathname = usePathname();
  const displayName = user?.fullName ?? 'Mon compte';
  const displayRole = user?.roleLabel ?? '';

  // Gating par rôle : on masque les items dont la section n'est pas accessible.
  const groups = GROUPS.map((g) =>
    g.items
      ? { ...g, items: g.items.filter((i) => { const s = sectionForPath(i.href); return s ? can(user?.role, s) !== 'none' : true; }) }
      : g,
  ).filter((g) => g.items === undefined || g.items.length > 0);
  const [hovered, setHovered] = useState<string | null>(null);
  const lastFlyoutKey = useRef<string>('formations');

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const activeGroupKey =
    groups.find((g) => {
      if (g.href) return isActive(g.href);
      return g.items?.some((i) => isActive(i.href));
    })?.key ?? null;

  const groupBadgeTotal = (g: Group): number => {
    if (!counts || !g.countKeys) return 0;
    return g.countKeys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  };

  const subItemBadge = (href: string): { count: number; tone: Tone } | null => {
    const mapping = COUNT_BY_HREF[href];
    if (!mapping || !counts) return null;
    const value = counts[mapping.key];
    if (!value || value <= 0) return null;
    return { count: value, tone: mapping.tone };
  };

  if (hovered && hovered !== 'accueil') {
    const g = groups.find((x) => x.key === hovered);
    if (g?.items?.length) lastFlyoutKey.current = hovered;
  }

  const flyoutGroup = groups.find((g) => g.key === lastFlyoutKey.current);
  const showFlyout =
    hovered !== null &&
    hovered !== 'accueil' &&
    (groups.find((g) => g.key === hovered)?.items?.length ?? 0) > 0;

  const userInitials = displayName
    .split(' ')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* Spacer — réserve la largeur de l'icon-bar dans le flow flex du layout */}
      <div className="w-16 shrink-0" />

      {/* Container fixe — icon-bar + flyout */}
      <div
        className="fixed left-0 top-0 h-screen z-40 flex"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Icon-bar */}
        <nav
          className="w-16 flex flex-col items-center border-r border-orange-200/60 dark:border-zinc-800"
          style={{
            background:
              'linear-gradient(180deg, hsl(24 100% 97%) 0%, hsl(24 95% 92%) 50%, hsl(24 90% 88%) 100%)',
          }}
        >
          <div className="dark:hidden contents">{/* gradient clair (défaut ci-dessus) */}</div>

          {/* Logo planète + wordmark Capsule IA (empilés) */}
          <Link href="/" className="mt-4 mb-2 shrink-0 flex flex-col items-center gap-1" aria-label="Accueil">
            <Logo size="sm" showWordmark={false} />
            <span className="text-[10px] font-semibold tracking-tight leading-none text-zinc-700 dark:text-zinc-300">
              Capsule&nbsp;IA
            </span>
          </Link>

          {/* CTA Nouveau dossier */}
          <Link
            href="/dossiers/nouveau"
            className="group mt-2 mb-3 w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shadow-sm transition"
            aria-label="Nouveau dossier"
            title="Nouveau dossier"
          >
            <Plus className="w-4 h-4 transition group-hover:rotate-90" />
          </Link>

          <div className="w-8 h-px bg-orange-200/80 dark:bg-zinc-800 mb-2" />

          {/* Groupes */}
          <div className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-thin">
            {groups.map((g) => {
              const Icon = g.icon;
              const active = activeGroupKey === g.key;
              const isHover = hovered === g.key;
              const total = groupBadgeTotal(g);

              const content = (
                <div
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 py-2 rounded-xl cursor-pointer transition-all duration-150',
                    active
                      ? 'bg-orange-500 text-white shadow-sm'
                      : isHover
                      ? 'bg-orange-100/70 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-orange-100/50 dark:hover:bg-orange-950/30 hover:text-orange-700 dark:hover:text-orange-300',
                  )}
                  onMouseEnter={() => setHovered(g.key)}
                >
                  <Icon className={cn('w-5 h-5 transition-transform duration-150', !active && 'group-hover:scale-110')} />
                  <span className="text-[10px] font-medium leading-tight">{g.label}</span>
                  {total > 0 && (
                    <span
                      className={cn(
                        'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium flex items-center justify-center tabular-nums shadow-sm',
                        active
                          ? 'bg-white text-orange-600'
                          : 'bg-rose-500 text-white',
                      )}
                    >
                      {total > 99 ? '99+' : total}
                    </span>
                  )}
                </div>
              );

              if (g.href) {
                return (
                  <Link key={g.key} href={g.href} className="group">
                    {content}
                  </Link>
                );
              }
              return (
                <div key={g.key} className="group">
                  {content}
                </div>
              );
            })}
          </div>

          {/* Réglages */}
          <div className="w-full px-2 pt-2">
            <Link
              href="/parametres"
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 rounded-xl cursor-pointer transition-all duration-150',
                isActive('/parametres')
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-orange-100/50 dark:hover:bg-orange-950/30 hover:text-orange-700 dark:hover:text-orange-300',
              )}
              onMouseEnter={() => setHovered(null)}
              aria-label="Paramètres"
            >
              <Settings className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">Paramètres</span>
            </Link>
          </div>

          {/* Avatar utilisateur */}
          <Link
            href="/parametres"
            className="my-3 group"
            aria-label={`Compte de ${displayName}`}
            title={displayName}
            onMouseEnter={() => setHovered(null)}
          >
            <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[12px] flex items-center justify-center shadow-sm ring-2 ring-white/60 dark:ring-zinc-900 group-hover:ring-orange-300 dark:group-hover:ring-orange-700 transition">
              {userInitials}
            </span>
          </Link>
        </nav>

        {/* Flyout panel */}
        <div
          className={cn(
            'bg-white dark:bg-zinc-950 border-r border-zinc-200/60 dark:border-zinc-800 transition-[width,opacity,box-shadow] duration-200 ease-out overflow-hidden',
            showFlyout
              ? 'w-60 opacity-100 shadow-xl'
              : 'w-0 opacity-0 shadow-none',
          )}
        >
          <div className="w-60 flex flex-col h-screen">
            {/* Header */}
            <div className="px-4 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
                Section
              </p>
              <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                {flyoutGroup?.label}
              </h3>
            </div>

            {/* Sous-items */}
            <ul className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
              {flyoutGroup?.items?.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const badge = subItemBadge(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition whitespace-nowrap',
                        active
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
                      )}
                      onClick={() => setHovered(null)}
                    >
                      <span
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition',
                          active
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'bg-orange-100/70 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 group-hover:scale-105',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge && (
                        <span
                          className={cn(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums',
                            badgeStyles[badge.tone],
                          )}
                        >
                          {badge.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}

              {/* Récents (uniquement pour la section Dossiers) */}
              {flyoutGroup?.showRecents && (
                <li className="pt-4">
                  <p className="px-3 mb-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium">
                    Récents
                  </p>
                  <ul className="space-y-0.5">
                    {recentDossiers.map((d) => {
                      const learnerName = learnerFullName(d.learnerId);
                      const inits = learnerName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
                      const palIdx = learnerName.charCodeAt(0) % avatarPalette.length;
                      return (
                        <li key={d.id}>
                          <Link
                            href={`/dossiers/${d.id}`}
                            className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                            onClick={() => setHovered(null)}
                          >
                            <span className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium flex-shrink-0',
                              avatarPalette[palIdx],
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
                </li>
              )}
            </ul>

            {/* Footer flyout — profil compact */}
            <Link
              href="/parametres"
              className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-900 flex items-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
              onClick={() => setHovered(null)}
            >
              <span className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[11px] flex items-center justify-center shadow-sm">
                {userInitials}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {displayName}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize truncate">
                  {displayRole}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
