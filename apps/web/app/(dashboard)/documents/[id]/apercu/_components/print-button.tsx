'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
    >
      <Printer className="w-4 h-4" />
      Imprimer / Enregistrer en PDF
    </button>
  );
}
