'use client';
// ARCHETYPE: command
// Bouton d'export PDF « au look » : déclenche l'impression navigateur, qui
// applique le CSS @media print du ProgrammeDocument (couleurs conservées).

import { Printer } from 'lucide-react';

export function PrintProgrammeButton({ label = 'Télécharger le PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 print:hidden"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
