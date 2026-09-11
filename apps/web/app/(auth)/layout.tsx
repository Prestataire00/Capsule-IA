// ARCHETYPE: shared (workflow-like, sans nav)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="relative">{children}</div>
    </div>
  );
}
