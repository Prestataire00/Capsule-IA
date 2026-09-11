// ARCHETYPE: shared (command — topbar simplifiée)
import Link from 'next/link';
import { Mail, Search } from 'lucide-react';
import { ThemeToggle } from '@/shared/components/theme/theme-toggle';
import { LogoutButton } from '@/shared/components/layout/logout-button';
import { NotificationsBell } from '@/shared/components/layout/notifications-bell';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember, initialsOf } from '@/shared/lib/auth/current-member';
import type { Notif } from '@/app/(dashboard)/notifications/notif-meta';

export async function Topbar() {
  const me = await getCurrentMember();
  const fullName = me?.fullName ?? 'Mon compte';
  const initials = initialsOf(fullName) || '·';

  const sb = supabaseServer();
  const [{ data: recent }, { count: unread }] = await Promise.all([
    sb
      .schema('app')
      .from('notifications')
      .select('id, template_code, subject, payload, created_at, related_aggregate_type, related_aggregate_id, read_at')
      .eq('channel', 'in_app')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
    sb
      .schema('app')
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'in_app')
      .is('read_at', null),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifications = ((recent as any[]) ?? []) as Notif[];

  return (
    <header className="h-16 flex-shrink-0 border-b border-zinc-200/70 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-40 flex items-center px-6 gap-4">
      <div className="flex-1" />

      <form action="/dossiers" method="get" className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="search"
          name="q"
          placeholder="Rechercher un dossier, apprenant, formation…"
          className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
        />
      </form>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationsBell notifications={notifications} unreadCount={unread ?? 0} />
        <Link
          href="/reclamations"
          aria-label="Messages"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
        >
          <Mail className="w-4 h-4" />
        </Link>
        <Link
          href="/parametres"
          className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-bold text-[11px] flex items-center justify-center ring-1 ring-inset ring-orange-200/70 dark:ring-orange-900/50 hover:bg-orange-200/70 dark:hover:bg-orange-900/50 transition"
          aria-label={fullName}
          title={fullName}
        >
          {initials}
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
