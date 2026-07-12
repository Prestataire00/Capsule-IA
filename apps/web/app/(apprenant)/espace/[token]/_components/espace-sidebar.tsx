'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Route,
  Video,
  FileText,
  PenLine,
  MessageSquareWarning,
} from 'lucide-react';

type NavItem = {
  href: (token: string) => string;
  exact?: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: (t) => `/espace/${t}`, exact: true, label: 'Accueil', icon: Home },
  { href: (t) => `/espace/${t}/parcours`, label: 'Mon parcours', icon: Route },
  { href: (t) => `/espace/${t}/sessions`, label: 'Sessions & replays', icon: Video },
  { href: (t) => `/espace/${t}/documents`, label: 'Documents', icon: FileText },
  { href: (t) => `/espace/${t}/exercices`, label: 'Exercices', icon: PenLine },
  { href: (t) => `/espace/${t}/reclamation`, label: 'Réclamation', icon: MessageSquareWarning },
];

export function EspaceSidebar({
  token,
  organizationName,
  organizationLogoUrl,
  learnerFirstName,
  learnerLastName,
  dossierReference,
}: {
  token: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  learnerFirstName: string;
  learnerLastName: string;
  dossierReference: string;
}) {
  const pathname = usePathname();
  const base = `/espace/${token}`;

  const initials = `${learnerFirstName[0] ?? ''}${learnerLastName[0] ?? ''}`.toUpperCase();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm flex flex-col">
      {/* Brand — organisme de formation */}
      <div className="px-4 py-5 border-b border-zinc-200/60 dark:border-zinc-800">
        {organizationLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizationLogoUrl}
            alt={organizationName}
            className="max-h-12 max-w-[180px] object-contain"
          />
        ) : (
          <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {organizationName}
          </span>
        )}
      </div>

      {/* Apprenant identity */}
      <div className="px-4 py-4 border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/60 dark:to-rose-950/30 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {learnerFirstName} {learnerLastName}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate">{dossierReference}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const href = item.href(token);
            const active = item.exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            const Icon = item.icon;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition group ${
                    active
                      ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-violet-600 dark:bg-violet-400 rounded-full" />
                  )}
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-zinc-200/60 dark:border-zinc-800">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Espace propulsé par<br />
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Capsule IA</span>
        </p>
      </div>
    </aside>
  );
}
