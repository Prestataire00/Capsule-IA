// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: 'neutral' | 'success' | 'warning' | 'danger';
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const hintColors = {
    neutral: 'text-zinc-500 dark:text-zinc-400',
    success: 'text-emerald-600 dark:text-emerald-500',
    warning: 'text-amber-600 dark:text-amber-500',
    danger: 'text-red-600 dark:text-red-500',
  };
  return (
    <div
      className={cn(
        'group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition" />}
      </div>
      <p className="text-2xl font-medium mt-2 tabular-nums">{value}</p>
      {hint && (
        <p className={cn('text-[11px] mt-1.5', hintColors[hintTone ?? 'neutral'])}>{hint}</p>
      )}
    </div>
  );
}
