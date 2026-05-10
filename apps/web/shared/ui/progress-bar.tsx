// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

type Tone = 'violet' | 'emerald' | 'amber' | 'rose' | 'blue' | 'zinc';

const colors: Record<Tone, string> = {
  violet: 'bg-violet-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  blue: 'bg-blue-500',
  zinc: 'bg-zinc-400 dark:bg-zinc-500',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'violet',
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn(
        'w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', colors[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
