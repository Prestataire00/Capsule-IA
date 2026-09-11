// ARCHETYPE: shared (plein écran, sans navigation) — projection en salle.
export default function ProjectionLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">{children}</div>;
}
