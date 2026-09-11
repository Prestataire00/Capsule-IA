import 'server-only';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { OfSwitcher } from './of-switcher';
import type { TrainerMembership } from '../application/ports';

/** `showOfLink` : retour à l'espace de l'organisme, pour un formateur qui en est aussi membre. */
export function FormateurHeader({ memberships, showOfLink }: { memberships: TrainerMembership[]; showOfLink: boolean }) {
  const focus = cookies().get('of_focus')?.value ?? 'all';

  return (
    <header className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between gap-3">
      {showOfLink ? (
        <Link
          href="/"
          className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3 h-3" />
          Espace OF
        </Link>
      ) : (
        <Logo size="sm" />
      )}
      {showOfLink && <Logo size="sm" className="hidden sm:inline-flex" />}
      <div className="flex items-center gap-2">
        <OfSwitcher memberships={memberships} current={focus} />
      </div>
    </header>
  );
}
