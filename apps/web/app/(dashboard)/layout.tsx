// ARCHETYPE: command (shell)
// Justification: shell global de l'espace OF — sidebar + topbar + assistant IA flottant.

import { SidebarRail } from '@/shared/components/layout/sidebar-rail';
import { Topbar } from '@/shared/components/layout/topbar';
import { AiAssistant } from '@/shared/components/ai/ai-assistant';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <SidebarRail />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>
      <AiAssistant />
    </div>
  );
}
