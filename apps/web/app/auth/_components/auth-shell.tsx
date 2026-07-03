// ARCHETYPE: shared (fond auth réutilisable pour les pages /auth/*, hors groupe (auth))
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-orange-200/50 dark:bg-orange-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-rose-200/50 dark:bg-rose-500/10 blur-3xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
