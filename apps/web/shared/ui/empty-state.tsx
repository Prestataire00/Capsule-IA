// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('text-center py-16 px-6', className)}>
      {Icon && (
        <div className="inline-flex w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
        </div>
      )}
      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {description && (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-5 inline-block">{action}</div>}
    </div>
  );
}
