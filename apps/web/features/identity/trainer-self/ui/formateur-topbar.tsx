import 'server-only';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, Search } from 'lucide-react';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { LogoutButton } from '@/shared/components/layout/logout-button';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { Notif } from '@/app/(dashboard)/notifications/notif-meta';
import { OfSwitcher } from './of-switcher';
import { FormateurBell } from './formateur-bell.client';
import type { TrainerMembership } from '../application/ports';

/**
 * Barre du haut de l'espace formateur, sur le modèle de celle de l'organisme :
 * recherche, cloche, thème, déconnexion.
 *
 * Les notifications sont lues par destinataire (`recipient_user_id`) et non par
 * organisation : un formateur externe n'appartient à aucune, et la requête de
 * l'organisme ne lui aurait rien rendu.
 *
 * `showOfLink` : retour à l'espace de l'organisme, pour un formateur qui en est
 * aussi membre.
 */
export async function FormateurTopbar({
  memberships,
  showOfLink,
}: {
  memberships: TrainerMembership[];
  showOfLink: boolean;
}) {
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const moi = memberships[0];
  const initiales = moi ? `${moi.firstName[0] ?? ''}${moi.lastName[0] ?? ''}`.toUpperCase() : '·';

  const {
    data: { user },
  } = await supabaseServer().auth.getUser();

  let notifications: Notif[] = [];
  let nonLues = 0;
  if (user) {
    const admin = supabaseAdmin();
    const [{ data: recentes }, { count }] = await Promise.all([
      admin
        .schema('app')
        .from('notifications')
        .select('id, template_code, subject, payload, created_at, related_aggregate_type, related_aggregate_id, read_at')
        .eq('recipient_user_id', user.id)
        .eq('channel', 'in_app')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(8),
      admin
        .schema('app')
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', user.id)
        .eq('channel', 'in_app')
        .is('read_at', null),
    ]);
    notifications = ((recentes ?? []) as unknown as Notif[]) ?? [];
    nonLues = count ?? 0;
  }

  return (
    <header className="h-16 flex-shrink-0 border-b border-zinc-200/70 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-30 flex items-center px-5 gap-3">
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
          {initiales}
        </span>
        <span className="min-w-0 leading-tight hidden sm:block">
          <span className="block text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {moi ? `${moi.firstName} ${moi.lastName}` : 'Espace formateur'}
          </span>
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Espace formateur</span>
        </span>
      </span>

      {/* Recherche dans SES séances : un formateur cherche « la journée chez
          Untel », pas un dossier de l'organisme auquel il n'a pas accès. */}
      <form action="/mes-sessions" method="get" className="relative flex-1 max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="search"
          name="q"
          placeholder="Rechercher une séance…"
          className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
        />
      </form>

      <div className="flex items-center gap-2 shrink-0">
        {showOfLink && (
          <Link
            href="/"
            className="h-9 px-3 rounded-lg text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Espace organisme</span>
          </Link>
        )}
        <OfSwitcher memberships={memberships} current={focus} />
        <FormateurBell notifications={notifications} unreadCount={nonLues} />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
