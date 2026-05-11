// ARCHETYPE: shared
import { SectionLabel } from '@/shared/ui/section-label';
import { ParametresSubnav } from './_components/parametres-subnav';

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Configuration</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Paramètres</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Réglages de l'organisation, des membres et des intégrations.
        </p>
      </header>

      <div className="flex gap-8 items-start">
        <ParametresSubnav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
