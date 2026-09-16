'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, FolderOpen, Home, CircleUser } from 'lucide-react';

/**
 * Navigation de l'espace formateur.
 *
 * Elle comptait neuf entrées de même poids, dont cinq pour l'administratif —
 * factures, frais, évaluations, profil, CV — qu'on ouvre une fois par mois. Et
 * les mêmes séances s'affichaient sur l'accueil, le planning et la liste :
 * trois chemins pour un seul travail, d'où l'impression que rien n'était clair.
 *
 * Cinq entrées suffisent, et chacune répond à une question différente :
 *   Aujourd'hui   — qu'ai-je à faire maintenant ?
 *   Planning      — quand suis-je pris, quand suis-je libre ?
 *   Mes séances   — sur quoi je travaille : préparer, animer, émarger.
 *   Mes dossiers  — pour quel client ?
 *   Mon compte    — le reste : facturation, frais, profil, preuves.
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
    href: '/formateur',
    label: 'Aujourd’hui',
    court: 'Aujourd’hui',
    icon: Home,
    prefixes: [],
    doux: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    plein: 'bg-orange-500 text-white shadow-orange-500/30',
  },
  {
    href: '/mon-planning',
    label: 'Planning',
    court: 'Planning',
    icon: CalendarDays,
    prefixes: ['/mon-planning'],
    doux: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    plein: 'bg-blue-500 text-white shadow-blue-500/30',
  },
  {
    href: '/mes-sessions',
    label: 'Mes séances',
    court: 'Séances',
    icon: ClipboardList,
    prefixes: ['/mes-sessions', '/emarger', '/seance'],
    doux: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    plein: 'bg-sky-500 text-white shadow-sky-500/30',
  },
  {
    href: '/mes-dossiers',
    label: 'Mes dossiers',
    court: 'Dossiers',
    icon: FolderOpen,
    prefixes: ['/mes-dossiers'],
    doux: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    plein: 'bg-teal-500 text-white shadow-teal-500/30',
  },
  {
    href: '/mon-compte',
    label: 'Mon compte',
    court: 'Compte',
    icon: CircleUser,
    // Les cinq pages administratives vivent sous cette entrée : elles restent à
    // leur adresse, mais la barre ne les met plus au même rang qu'une séance.
    prefixes: [
      '/mon-compte',
      '/mes-factures',
      '/mes-frais',
      '/mes-evaluations',
      '/profil',
      '/profil-facturation',
      '/cv',
    ],
    doux: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    plein: 'bg-zinc-700 text-white shadow-zinc-700/30',
  },
];

export function FormateurNav() {
  const chemin = usePathname();
  return (
    <nav
      aria-label="Espace formateur"
      className="border-b border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/70 backdrop-blur sticky top-0 z-20 overflow-x-auto"
    >
      <ul className="flex items-center gap-1.5 px-3 py-2 min-w-max">
        {LIENS.map(({ href, label, court, icon: Icone, prefixes, doux, plein }) => {
          const actif =
            href === '/formateur' ? chemin === href : prefixes.some((p) => chemin === p || chemin.startsWith(`${p}/`));
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
