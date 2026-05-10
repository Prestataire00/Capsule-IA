// ARCHETYPE: shared (workflow-like, sans nav)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
