// ARCHETYPE: shared
// Statuts — couleurs sémantiques en FOND (autorisé par la charte) pour visibilité.
import { cn } from '@/shared/lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, { text: string; dot: string; bg: string }> = {
  neutral: {
    text: 'text-zinc-700 dark:text-zinc-300',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
    bg: 'bg-zinc-100 dark:bg-zinc-800/70',
  },
  success: {
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
  },
  warning: {
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
  },
  danger: {
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-950/50',
  },
  info: {
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/60',
  },
};

export function StatusPill({
  tone = 'neutral',
  variant = 'soft',
  children,
  className,
}: {
  tone?: Tone;
  variant?: 'soft' | 'minimal';
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  if (variant === 'minimal') {
    return (
      <span className={cn('text-xs inline-flex items-center gap-1.5', t.text, className)}>
        <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'text-[12px] inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full font-semibold whitespace-nowrap',
        t.bg,
        t.text,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  );
}

export function dossierStatusTone(status: string): Tone {
  switch (status) {
    case 'active':
      return 'success';
    case 'completed':
      return 'info';
    case 'closed':
      return 'neutral';
    case 'archived':
      return 'neutral';
    case 'scheduled':
      return 'info';
    case 'pending_validation':
      return 'warning';
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
