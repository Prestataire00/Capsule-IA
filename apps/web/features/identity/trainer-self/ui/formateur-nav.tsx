'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, FileBadge, FolderOpen, Home, Receipt, Star, UserRound, Wallet } from 'lucide-react';

/**
 * Navigation de l'espace formateur.
 *
 * Neuf entrées sur le même plan ne disent pas ce qui compte : préparer et
 * animer une séance d'un côté, la paperasse de l'autre. Elles sont donc
 * séparées en deux groupes par un trait — le travail à gauche, l'administratif
 * à droite — et chaque rubrique garde sa couleur (charte v4.1).
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
  /** Le travail de formateur, ou ce qui l'entoure. */
  groupe: 'animer' | 'administratif';
};

const LIENS: Lien[] = [
  {
    href: '/formateur', label: 'Accueil', court: 'Accueil', icon: Home, prefixes: [], groupe: 'animer',
    doux: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    plein: 'bg-orange-500 text-white shadow-orange-500/30',
  },
  {
    href: '/mon-planning', label: 'Planning & disponibilités', court: 'Planning', icon: CalendarDays,
    prefixes: ['/mon-planning'], groupe: 'animer',
    doux: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    plein: 'bg-blue-500 text-white shadow-blue-500/30',
  },
  {
    href: '/mes-sessions', label: 'Mes séances', court: 'Séances', icon: ClipboardList,
    prefixes: ['/mes-sessions', '/emarger', '/seance'], groupe: 'animer',
    doux: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    plein: 'bg-sky-500 text-white shadow-sky-500/30',
  },
  {
    href: '/mes-dossiers', label: 'Dossiers confiés', court: 'Dossiers', icon: FolderOpen,
    prefixes: ['/mes-dossiers'], groupe: 'animer',
    doux: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    plein: 'bg-teal-500 text-white shadow-teal-500/30',
  },
  {
    href: '/mes-evaluations', label: 'Mes évaluations', court: 'Évaluations', icon: Star,
    prefixes: ['/mes-evaluations'], groupe: 'administratif',
    doux: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    plein: 'bg-purple-500 text-white shadow-purple-500/30',
  },
  {
    href: '/mes-factures', label: 'Factures', court: 'Factures', icon: Receipt,
    prefixes: ['/mes-factures', '/profil-facturation'], groupe: 'administratif',
    doux: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    plein: 'bg-emerald-500 text-white shadow-emerald-500/30',
  },
  {
    href: '/mes-frais', label: 'Notes de frais', court: 'Frais', icon: Wallet, prefixes: ['/mes-frais'],
    groupe: 'administratif',
    doux: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    plein: 'bg-teal-500 text-white shadow-teal-500/30',
  },
  {
    href: '/profil', label: 'Profil', court: 'Profil', icon: UserRound, prefixes: ['/profil'],
    groupe: 'administratif',
    doux: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    plein: 'bg-rose-500 text-white shadow-rose-500/30',
  },
  {
    href: '/cv', label: 'CV & compétences', court: 'CV', icon: FileBadge, prefixes: ['/cv'],
    groupe: 'administratif',
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
      <ul className="flex items-center gap-1.5 px-3 py-2 min-w-max">
        {LIENS.map(({ href, label, court, icon: Icone, prefixes, doux, plein, groupe }, i) => {
          const debutAdministratif = groupe === 'administratif' && LIENS[i - 1]?.groupe === 'animer';
          const actif = href === '/formateur' ? chemin === href : prefixes.some((p) => chemin === p || chemin.startsWith(`${p}/`));
          return (
            <li key={href} className={debutAdministratif ? 'flex items-center gap-1.5' : undefined}>
              {debutAdministratif && (
                <span className="h-6 w-px bg-zinc-200 dark:bg-zinc-700 mx-1" aria-hidden />
              )}
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
