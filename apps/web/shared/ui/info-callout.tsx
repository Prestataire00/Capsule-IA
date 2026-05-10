// ARCHETYPE: shared
import { Info, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Tone = 'info' | 'warning' | 'success' | 'danger';

const styles: Record<Tone, { bg: string; border: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  info:    { bg: 'bg-blue-50 dark:bg-blue-950/30',     border: 'border-blue-400',    text: 'text-blue-900 dark:text-blue-200',     icon: Info },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-400',   text: 'text-amber-900 dark:text-amber-200',   icon: AlertTriangle },
  success: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-400', text: 'text-emerald-900 dark:text-emerald-200', icon: CheckCircle2 },
  danger:  { bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-400',     text: 'text-red-900 dark:text-red-200',       icon: AlertCircle },
};

export function InfoCallout({ tone = 'info', children, className }: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const s = styles[tone];
  const Icon = s.icon;
  const iconColor =
    tone === 'info' ? 'text-blue-600' :
    tone === 'warning' ? 'text-amber-600' :
    tone === 'success' ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className={cn('rounded-md px-4 py-3 flex gap-2.5 border-l-2', s.bg, s.border, className)}>
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', iconColor)} />
      <div className={cn('text-xs', s.text)}>{children}</div>
    </div>
  );
}
