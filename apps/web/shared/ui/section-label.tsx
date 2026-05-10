// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500',
        className,
      )}
    >
      {children}
    </p>
  );
}
