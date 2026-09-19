// ARCHETYPE: shared
import { Settings } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { ParametresSubnav } from './_components/parametres-subnav';
import { requireAccess } from '@/shared/lib/auth/require-access';

export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  await requireAccess('settings'); // owner/admin uniquement
  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-rose-950/30 px-7 py-6 flex items-center gap-5">
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 shrink-0">
          <Settings className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <SectionLabel className="mb-2">Configuration</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Paramètres</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3">
            Réglages de l'organisation, des membres et des intégrations.
          </p>
        </div>
      </header>

      <div className="flex gap-8 items-start">
        <ParametresSubnav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
