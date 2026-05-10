// ARCHETYPE: shared (mobile-first formateur)
// Justification: layout simplifié mobile-first pour formateurs en présentiel.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FormateurLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
        <Link
          href="/"
          className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3 h-3" />
          Espace OF
        </Link>
        <span className="text-[11px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
          Espace formateur
        </span>
        <span className="font-mono text-[10px] text-zinc-400">v0.0.1</span>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
