// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[11px] font-bold tracking-[0.08em] uppercase text-orange-600 dark:text-orange-400',
        className,
      )}
    >
      {children}
    </p>
  );
}
