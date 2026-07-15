// ARCHETYPE: command
// Justification : page interne de contrôle visuel du gabarit « Programme de
// formation » (reproduction fidèle de la maquette Capsule IA). Sert à valider le
// rendu avant branchement sur les vraies données ; réutilise le composant public.

import { ProgrammeDocument } from '@/features/formations/programme/programme-document';
import { PrintProgrammeButton } from '@/features/formations/programme/print-button.client';
import { SAMPLE_CAPSULE_PROGRAMME } from '@/features/formations/programme/sample-capsule';

export default function ApercuProgrammePage() {
  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-[820px] items-center justify-between px-6 py-4 print:hidden">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Aperçu du gabarit — reproduction fidèle de la maquette, entièrement pilotée par le thème.
        </p>
        <PrintProgrammeButton />
      </div>
      <div className="pb-16">
        <ProgrammeDocument programme={SAMPLE_CAPSULE_PROGRAMME} />
      </div>
    </div>
  );
}
