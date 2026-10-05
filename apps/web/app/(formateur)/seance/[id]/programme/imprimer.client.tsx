'use client';

import { Printer } from 'lucide-react';

export function Imprimer() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition"
    >
      <Printer className="w-3.5 h-3.5" /> Imprimer
    </button>
  );
}
