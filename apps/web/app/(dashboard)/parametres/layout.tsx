// ARCHETYPE: shared
import { SectionLabel } from '@/shared/ui/section-label';
import { ParametresSubnav } from './_components/parametres-subnav';
import { requireAccess } from '@/shared/lib/auth/require-access';

export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  await requireAccess('settings'); // owner/admin uniquement
  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Configuration</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Paramètres</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
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
