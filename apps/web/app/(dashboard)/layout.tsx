// ARCHETYPE: command (shell)
// Justification: shell global de l'espace OF — sidebar + topbar + assistant IA flottant.

import { SidebarRailServer } from '@/shared/components/layout/sidebar-rail-server';
import { Topbar } from '@/shared/components/layout/topbar';
import { AiAssistant } from '@/shared/components/ai/ai-assistant';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
