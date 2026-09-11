'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, FileBadge, Home, Receipt, Star, UserRound, Wallet } from 'lucide-react';

const LIENS = [
  { href: '/formateur', label: 'Accueil', icon: Home, prefixes: [] as string[] },
  { href: '/mon-planning', label: 'Planning', icon: CalendarDays, prefixes: ['/mon-planning'] },
  { href: '/mes-sessions', label: 'Sessions & émargement', icon: ClipboardList, prefixes: ['/mes-sessions', '/emarger', '/seance'] },
  { href: '/mes-evaluations', label: 'Évaluations', icon: Star, prefixes: ['/mes-evaluations'] },
  { href: '/mes-factures', label: 'Factures', icon: Receipt, prefixes: ['/mes-factures', '/profil-facturation'] },
  { href: '/mes-frais', label: 'Frais', icon: Wallet, prefixes: ['/mes-frais'] },
  { href: '/profil', label: 'Profil', icon: UserRound, prefixes: ['/profil'] },
  { href: '/cv', label: 'CV & compétences', icon: FileBadge, prefixes: ['/cv'] },
];

/** Navigation de l'espace formateur : défile horizontalement sur téléphone. */
export function FormateurNav() {
  const chemin = usePathname();
  return (
    <nav aria-label="Espace formateur" className="border-b border-zinc-200/60 dark:border-zinc-800 overflow-x-auto">
      <ul className="flex gap-1 px-3 min-w-max">
        {LIENS.map(({ href, label, icon: Icone, prefixes }) => {
          const actif = href === '/formateur' ? chemin === href : prefixes.some((p) => chemin === p || chemin.startsWith(`${p}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={actif ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] border-b-2 transition ${
                  actif
                    ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Icone className="w-4 h-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
