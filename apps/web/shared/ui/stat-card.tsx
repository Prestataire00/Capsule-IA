// ARCHETYPE: shared
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { ArrowUpRight } from 'lucide-react';

type Accent = 'violet' | 'orange' | 'rose' | 'blue' | 'purple' | 'emerald' | 'amber' | 'zinc';

// Charte v4 : pas de pastille d'icône colorée. L'accent ne teinte plus qu'un fin
// liseré au survol (quand la carte est cliquable) ; l'icône reste monochrome.
const accentRing: Record<Accent, string> = {
  violet: 'group-hover:border-orange-200 dark:group-hover:border-orange-900/50',
  orange: 'group-hover:border-orange-200 dark:group-hover:border-orange-900/50',
  rose: 'group-hover:border-rose-200 dark:group-hover:border-rose-900/40',
  blue: 'group-hover:border-blue-200 dark:group-hover:border-blue-900/40',
  purple: 'group-hover:border-purple-200 dark:group-hover:border-purple-900/40',
  emerald: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-900/40',
  amber: 'group-hover:border-amber-200 dark:group-hover:border-amber-900/40',
  zinc: 'group-hover:border-zinc-300 dark:group-hover:border-zinc-700',
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

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500" />}
          <span className="truncate">{label}</span>
        </p>
        {href && (
          <ArrowUpRight className="w-4 h-4 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-600 dark:group-hover:text-orange-300 transition" />
        )}
      </div>
      <p className="text-[26px] leading-none font-extrabold mt-3 tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      {hint && (
        <p className={cn('text-[12px] mt-2 tabular-nums', hintColors[hintTone ?? 'neutral'])}>{hint}</p>
      )}
    </>
  );

  const baseClass = cn(
    'group bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm transition block',
    href && 'hover:shadow-md',
    href && accentRing[accent],
    className,
  );

  if (href) {
    return <Link href={href} className={baseClass}>{content}</Link>;
  }
  return <div className={baseClass}>{content}</div>;
}
