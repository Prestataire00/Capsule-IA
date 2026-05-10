// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, { text: string; dot: string }> = {
  neutral: { text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' },
  success: { text: 'text-emerald-600 dark:text-emerald-500', dot: 'bg-emerald-500' },
  warning: { text: 'text-amber-600 dark:text-amber-500', dot: 'bg-amber-500' },
  danger: { text: 'text-red-600 dark:text-red-500', dot: 'bg-red-500' },
  info: { text: 'text-blue-600 dark:text-blue-500', dot: 'bg-blue-500' },
};

export function StatusPill({ tone = 'neutral', children, className }: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span className={cn('text-xs inline-flex items-center gap-1.5', t.text, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  );
}

export function dossierStatusTone(status: string): Tone {
  switch (status) {
    case 'active':
    case 'completed':
      return 'success';
    case 'closed':
    case 'archived':
      return 'neutral';
    case 'scheduled':
    case 'pending_validation':
      return 'info';
    case 'draft':
      return 'neutral';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function dossierStatusLabel(status: string): string {
  return {
    draft: 'brouillon',
    pending_validation: 'à valider',
    scheduled: 'planifié',
    active: 'en cours',
    completed: 'terminé',
    closed: 'clôturé',
    archived: 'archivé',
    cancelled: 'annulé',
  }[status] ?? status;
}
