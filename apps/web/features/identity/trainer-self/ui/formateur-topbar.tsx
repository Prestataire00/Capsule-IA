import 'server-only';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { LogoutButton } from '@/shared/components/layout/logout-button';
import { OfSwitcher } from './of-switcher';
import type { TrainerMembership } from '../application/ports';

/**
 * Barre du haut de l'espace formateur, sur le modèle de celle de l'organisme :
 * l'identité à gauche, les commandes de compte à droite.
 *
 * `showOfLink` : retour à l'espace de l'organisme, pour un formateur qui en est
 * aussi membre.
 */
export function FormateurTopbar({
  memberships,
  showOfLink,
}: {
  memberships: TrainerMembership[];
  showOfLink: boolean;
}) {
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const moi = memberships[0];
  const initiales = moi ? `${moi.firstName[0] ?? ''}${moi.lastName[0] ?? ''}`.toUpperCase() : '·';

  return (
    <header className="h-16 flex-shrink-0 border-b border-zinc-200/70 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-30 flex items-center px-5 gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
          {initiales}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {moi ? `${moi.firstName} ${moi.lastName}` : 'Espace formateur'}
          </span>
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Espace formateur</span>
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showOfLink && (
          <Link
            href="/"
            className="h-9 px-3 rounded-lg text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Espace organisme</span>
          </Link>
        )}
        <OfSwitcher memberships={memberships} current={focus} />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
