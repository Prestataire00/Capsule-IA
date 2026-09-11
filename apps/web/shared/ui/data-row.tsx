// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function DataRow({ left, right, className }: {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-2.5 flex justify-between gap-4 items-center text-[13px]', className)}>
      <div className="text-zinc-700 dark:text-zinc-300 min-w-0 truncate">{left}</div>
      <div className="flex-shrink-0 text-zinc-500 dark:text-zinc-400 tabular-nums">{right}</div>
    </div>
  );
}

export function DataList({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-zinc-100 dark:divide-zinc-800/80 border-y border-zinc-200/70 dark:border-zinc-800', className)}>
      {children}
    </div>
  );
}
