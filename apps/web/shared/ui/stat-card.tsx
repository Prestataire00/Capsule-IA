// ARCHETYPE: shared
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { ArrowUpRight } from 'lucide-react';

type Accent = 'violet' | 'orange' | 'rose' | 'blue' | 'purple' | 'emerald' | 'amber' | 'zinc';

const accentStyles: Record<Accent, { iconBg: string; iconText: string; ring: string }> = {
  violet: { iconBg: 'bg-violet-100 dark:bg-violet-950/40', iconText: 'text-violet-700 dark:text-violet-400', ring: 'group-hover:border-violet-200 dark:group-hover:border-violet-900/40' },
  orange: { iconBg: 'bg-violet-100 dark:bg-violet-950/40', iconText: 'text-violet-700 dark:text-violet-400', ring: 'group-hover:border-violet-200 dark:group-hover:border-violet-900/40' },
  rose: { iconBg: 'bg-rose-100 dark:bg-rose-950/40', iconText: 'text-rose-600 dark:text-rose-400', ring: 'group-hover:border-rose-200 dark:group-hover:border-rose-900/40' },
  blue: { iconBg: 'bg-blue-100 dark:bg-blue-950/40', iconText: 'text-blue-600 dark:text-blue-400', ring: 'group-hover:border-blue-200 dark:group-hover:border-blue-900/40' },
  purple: { iconBg: 'bg-purple-100 dark:bg-purple-950/40', iconText: 'text-purple-600 dark:text-purple-400', ring: 'group-hover:border-purple-200 dark:group-hover:border-purple-900/40' },
  emerald: { iconBg: 'bg-emerald-100 dark:bg-emerald-950/40', iconText: 'text-emerald-600 dark:text-emerald-400', ring: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-900/40' },
  amber: { iconBg: 'bg-amber-100 dark:bg-amber-950/40', iconText: 'text-amber-600 dark:text-amber-400', ring: 'group-hover:border-amber-200 dark:group-hover:border-amber-900/40' },
  zinc: { iconBg: 'bg-zinc-100 dark:bg-zinc-800/60', iconText: 'text-zinc-600 dark:text-zinc-400', ring: 'group-hover:border-zinc-300 dark:group-hover:border-zinc-700' },
};

export function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  accent = 'zinc',
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: 'neutral' | 'success' | 'warning' | 'danger';
  icon?: React.ComponentType<{ className?: string }>;
  accent?: Accent;
  href?: string;
  className?: string;
}) {
  const hintColors = {
    neutral: 'text-zinc-500 dark:text-zinc-400',
    success: 'text-emerald-600 dark:text-emerald-500',
    warning: 'text-amber-600 dark:text-amber-500',
    danger: 'text-red-600 dark:text-red-500',
  };
  const a = accentStyles[accent];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon && (
          <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center', a.iconBg)}>
            <Icon className={cn('w-4 h-4', a.iconText)} />
          </span>
        )}
        {href && (
          <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition" />
        )}
      </div>
      <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mt-3">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1 tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      {hint && (
        <p className={cn('text-[11px] mt-1.5', hintColors[hintTone ?? 'neutral'])}>{hint}</p>
      )}
    </>
  );

  const baseClass = cn(
    'group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md transition block',
    a.ring,
    className,
  );

  if (href) {
    return <Link href={href} className={baseClass}>{content}</Link>;
  }
  return <div className={baseClass}>{content}</div>;
}
