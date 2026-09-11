// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function IdPill({ children, className, emphasis }: {
  children: React.ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        'font-mono text-[11px] px-1.5 py-0.5 rounded-md',
        emphasis
          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
        className,
      )}
    >
      {children}
    </span>
  );
}
