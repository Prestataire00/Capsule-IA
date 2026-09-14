import 'server-only';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { LogoutButton } from '@/shared/components/layout/logout-button';
import { OfSwitcher } from './of-switcher';
import type { TrainerMembership } from '../application/ports';

/**
 * En-tête de l'espace formateur.
 *
 * Il ne portait ni identité ni sortie : un formateur externe, qui n'a pas la
 * barre de l'organisme, n'avait tout simplement aucun moyen de se déconnecter.
 * On voit désormais qui l'on est, et comment partir.
 *
 * `showOfLink` : retour à l'espace de l'organisme, pour un formateur qui en est aussi membre.
 */
export function FormateurHeader({ memberships, showOfLink }: { memberships: TrainerMembership[]; showOfLink: boolean }) {
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const moi = memberships[0];
  const initiales = moi ? `${moi.firstName[0] ?? ''}${moi.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <header className="px-4 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800 bg-gradient-to-r from-orange-50/80 via-white to-white dark:from-orange-950/20 dark:via-zinc-950 dark:to-zinc-950 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {showOfLink ? (
          <Link
            href="/"
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 inline-flex items-center gap-1.5 transition shrink-0"
          >
            <ArrowLeft className="w-3 h-3" />
            Espace OF
          </Link>
        ) : (
          <Logo size="sm" />
        )}
        {showOfLink && <Logo size="sm" className="hidden sm:inline-flex" />}

        {moi && (
          <span className="flex items-center gap-2 min-w-0 pl-1 sm:pl-2 sm:border-l border-zinc-200/70 dark:border-zinc-800">
            <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
              {initiales}
            </span>
            <span className="min-w-0 hidden sm:block leading-tight">
              <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {moi.firstName} {moi.lastName}
              </span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Espace formateur</span>
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <OfSwitcher memberships={memberships} current={focus} />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
