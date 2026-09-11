'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Users, ShieldCheck, Plug, Link2 } from 'lucide-react';

const ITEMS = [
  { href: '/parametres/organisation', label: 'Organisation', icon: Building2 },
  { href: '/parametres/membres', label: 'Membres', icon: Users },
  { href: '/parametres/inscription', label: "Lien d'inscription", icon: Link2 },
  { href: '/parametres/securite', label: 'Sécurité', icon: ShieldCheck },
  { href: '/parametres/integrations', label: 'Intégrations', icon: Plug },
];

export function ParametresSubnav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 flex-shrink-0">
      <ul className="space-y-0.5 sticky top-4">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition group ${
                  active
                    ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-bold'
                    : 'text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-orange-500 dark:bg-orange-400 rounded-full" />
                )}
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-orange-500 dark:text-orange-400' : 'text-zinc-400'}`} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
