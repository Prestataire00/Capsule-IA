'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, FileBadge, Home, Receipt, Star, UserRound, Wallet } from 'lucide-react';

/**
 * Navigation de l'espace formateur.
 *
 * Huit entrées se ressemblaient toutes : un formateur qui ouvre son espace
 * entre deux séances doit retrouver « Sessions » sans lire la barre. Chaque
 * rubrique porte donc sa couleur (charte v4.1) — personnes en rose, dates en
 * bleu, argent en vert, qualité en violet — et l'entrée active est pleine.
 */

type Lien = {
  href: string;
  label: string;
  court: string;
  icon: typeof Home;
  prefixes: string[];
  /** Carré du pictogramme au repos. */
  doux: string;
  /** Fond plein de l'entrée active. */
  plein: string;
};

const LIENS: Lien[] = [
  {
    href: '/formateur', label: 'Accueil', court: 'Accueil', icon: Home, prefixes: [],
    doux: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    plein: 'bg-orange-500 text-white shadow-orange-500/30',
  },
  {
    href: '/mon-planning', label: 'Planning', court: 'Planning', icon: CalendarDays, prefixes: ['/mon-planning'],
    doux: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    plein: 'bg-blue-500 text-white shadow-blue-500/30',
  },
  {
    href: '/mes-sessions', label: 'Sessions & émargement', court: 'Sessions', icon: ClipboardList,
    prefixes: ['/mes-sessions', '/emarger', '/seance'],
    doux: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    plein: 'bg-sky-500 text-white shadow-sky-500/30',
  },
  {
    href: '/mes-evaluations', label: 'Évaluations', court: 'Évaluations', icon: Star, prefixes: ['/mes-evaluations'],
    doux: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    plein: 'bg-purple-500 text-white shadow-purple-500/30',
  },
  {
    href: '/mes-factures', label: 'Factures', court: 'Factures', icon: Receipt,
    prefixes: ['/mes-factures', '/profil-facturation'],
    doux: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    plein: 'bg-emerald-500 text-white shadow-emerald-500/30',
  },
  {
    href: '/mes-frais', label: 'Frais', court: 'Frais', icon: Wallet, prefixes: ['/mes-frais'],
    doux: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    plein: 'bg-teal-500 text-white shadow-teal-500/30',
  },
  {
    href: '/profil', label: 'Profil', court: 'Profil', icon: UserRound, prefixes: ['/profil'],
    doux: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    plein: 'bg-rose-500 text-white shadow-rose-500/30',
  },
  {
    href: '/cv', label: 'CV & compétences', court: 'CV', icon: FileBadge, prefixes: ['/cv'],
    doux: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    plein: 'bg-amber-500 text-white shadow-amber-500/30',
  },
];

export function FormateurNav() {
  const chemin = usePathname();
  return (
    <nav
      aria-label="Espace formateur"
      className="border-b border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/70 backdrop-blur sticky top-0 z-20 overflow-x-auto"
    >
      <ul className="flex gap-1.5 px-3 py-2 min-w-max">
        {LIENS.map(({ href, label, court, icon: Icone, prefixes, doux, plein }) => {
          const actif = href === '/formateur' ? chemin === href : prefixes.some((p) => chemin === p || chemin.startsWith(`${p}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={actif ? 'page' : undefined}
                title={label}
                className={`group inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl text-[13px] transition ${
                  actif
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 transition ${actif ? `${plein} shadow-sm` : doux}`}
                >
                  <Icone className="w-4 h-4" aria-hidden />
                </span>
                {/* Le libellé long sert d'infobulle : la barre reste lisible sur téléphone. */}
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{court}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
