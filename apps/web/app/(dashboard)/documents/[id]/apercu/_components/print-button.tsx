'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm"
    >
      <Printer className="w-3.5 h-3.5" />
      Imprimer / Enregistrer en PDF
    </button>
  );
}
