// ARCHETYPE: shared
// Carte chiffre clé colorée (charte v4 « vivante ») : pictogramme sur carré de couleur, fond teinté.
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type Accent = 'orange' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal' | 'sky';

// Classes écrites en entier : Tailwind ne détecte pas les noms construits dynamiquement.
export const ACCENTS: Record<
  Accent,
  { card: string; chip: string; value: string; soft: string; bar: string; track: string; text: string }
> = {
  orange: {
    card: 'from-orange-50 to-white border-orange-100 dark:from-orange-950/40 dark:to-zinc-900 dark:border-orange-900/40',
    chip: 'bg-orange-500 shadow-orange-500/30',
    value: 'text-orange-700 dark:text-orange-300',
    soft: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    bar: 'bg-orange-500',
    track: 'bg-orange-100 dark:bg-orange-950/60',
    text: 'text-orange-600 dark:text-orange-400',
  },
  emerald: {
    card: 'from-emerald-50 to-white border-emerald-100 dark:from-emerald-950/40 dark:to-zinc-900 dark:border-emerald-900/40',
    chip: 'bg-emerald-500 shadow-emerald-500/30',
    value: 'text-emerald-700 dark:text-emerald-300',
    soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    track: 'bg-emerald-100 dark:bg-emerald-950/60',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    card: 'from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-zinc-900 dark:border-blue-900/40',
    chip: 'bg-blue-500 shadow-blue-500/30',
    value: 'text-blue-700 dark:text-blue-300',
    soft: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    bar: 'bg-blue-500',
    track: 'bg-blue-100 dark:bg-blue-950/60',
    text: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    card: 'from-purple-50 to-white border-purple-100 dark:from-purple-950/40 dark:to-zinc-900 dark:border-purple-900/40',
    chip: 'bg-purple-500 shadow-purple-500/30',
    value: 'text-purple-700 dark:text-purple-300',
    soft: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    bar: 'bg-purple-500',
    track: 'bg-purple-100 dark:bg-purple-950/60',
    text: 'text-purple-600 dark:text-purple-400',
  },
  amber: {
    card: 'from-amber-50 to-white border-amber-100 dark:from-amber-950/40 dark:to-zinc-900 dark:border-amber-900/40',
    chip: 'bg-amber-500 shadow-amber-500/30',
    value: 'text-amber-700 dark:text-amber-300',
    soft: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    bar: 'bg-amber-500',
    track: 'bg-amber-100 dark:bg-amber-950/60',
    text: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    card: 'from-rose-50 to-white border-rose-100 dark:from-rose-950/40 dark:to-zinc-900 dark:border-rose-900/40',
    chip: 'bg-rose-500 shadow-rose-500/30',
    value: 'text-rose-700 dark:text-rose-300',
    soft: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    bar: 'bg-rose-500',
    track: 'bg-rose-100 dark:bg-rose-950/60',
    text: 'text-rose-600 dark:text-rose-400',
  },
  teal: {
    card: 'from-teal-50 to-white border-teal-100 dark:from-teal-950/40 dark:to-zinc-900 dark:border-teal-900/40',
    chip: 'bg-teal-500 shadow-teal-500/30',
    value: 'text-teal-700 dark:text-teal-300',
    soft: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    bar: 'bg-teal-500',
    track: 'bg-teal-100 dark:bg-teal-950/60',
    text: 'text-teal-600 dark:text-teal-400',
  },
  sky: {
    card: 'from-sky-50 to-white border-sky-100 dark:from-sky-950/40 dark:to-zinc-900 dark:border-sky-900/40',
    chip: 'bg-sky-500 shadow-sky-500/30',
    value: 'text-sky-700 dark:text-sky-300',
    soft: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    bar: 'bg-sky-500',
    track: 'bg-sky-100 dark:bg-sky-950/60',
    text: 'text-sky-600 dark:text-sky-400',
  },
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'orange',
  href,
  children,
  className,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  accent?: Accent;
  href?: string;
  children?: ReactNode;
  className?: string;
}) {
  const a = ACCENTS[accent];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className={cn('w-10 h-10 rounded-xl grid place-items-center text-white shadow-md shrink-0', a.chip)}>
            <Icon className="w-5 h-5" />
          </span>
        ) : (
          <span />
        )}
        {href && (
          <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition" />
        )}
      </div>
      <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400 mt-4">{label}</p>
      {value !== undefined && (
        <p className={cn('text-[28px] leading-none font-extrabold tabular-nums mt-1.5', a.value)}>{value}</p>
      )}
      {children && <div className="mt-2">{children}</div>}
      {hint && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2 tabular-nums">{hint}</p>}
    </>
  );
  const cls = cn(
    'group block rounded-xl border bg-gradient-to-br p-5 shadow-sm min-w-0 transition',
    href && 'hover:shadow-md',
    a.card,
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Barre de progression à la couleur d'un accent. */
export function AccentBar({ value, max, accent, className }: { value: number; max: number; accent: Accent; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const a = ACCENTS[accent];
  return (
    <div className={cn('h-2 w-full rounded-full overflow-hidden', a.track, className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', a.bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
