// ARCHETYPE: command (shell)
// Justification: shell global de l'espace OF — sidebar + topbar + assistant IA flottant.

import { SidebarRailServer } from '@/shared/components/layout/sidebar-rail-server';
import { Topbar } from '@/shared/components/layout/topbar';
import { AiAssistant } from '@/shared/components/ai/ai-assistant';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { isTrainer } from '@/shared/lib/auth/landing';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Le shell de l'organisme est réservé à ses membres. Un formateur sans rôle
  // interne y arrivait auparavant sur une coquille vide — le cloisonnement ne
  // tenait que par la RLS, pas par l'accès (audit CAP-29).
  const membre = await getCurrentMember();
  if (!membre) {
    const {
      data: { user },
    } = await supabaseServer().auth.getUser();
    if (user && (await isTrainer(user.id))) redirect('/formateur');
    redirect('/login?motif=aucun-acces');
  }

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <SidebarRailServer />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>
      <AiAssistant />
    </div>
  );
}
