// ARCHETYPE: shared (workflow apprenant — minimal, sans nav)
// Justification: page tokenisée pour signature/questionnaire — pas d'auth, pas de menu.

export default function ApprenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-orange-600 dark:text-orange-400">
          Espace apprenant
        </span>
        <span className="text-[11px] font-medium text-zinc-400">lien sécurisé</span>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
