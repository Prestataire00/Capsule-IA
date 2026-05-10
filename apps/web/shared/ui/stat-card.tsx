// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function StatCard({ label, value, hint, className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2.5',
        className,
      )}
    >
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-xl font-medium mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
