// ARCHETYPE: shared (workflow apprenant — minimal, sans nav)
// Justification: page tokenisée pour signature/questionnaire — pas d'auth, pas de menu.

export default function ApprenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
          Espace apprenant
        </span>
        <span className="font-mono text-[10px] text-zinc-400">lien sécurisé</span>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
