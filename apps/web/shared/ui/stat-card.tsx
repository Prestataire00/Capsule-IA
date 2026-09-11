// ARCHETYPE: shared
// Carte chiffre clé : rendu coloré de KpiCard (pictogramme sur carré de couleur, fond teinté).
// L'API est conservée telle quelle pour tous les appelants existants.
import { cn } from '@/shared/lib/cn';
import { KpiCard, type Accent as KpiAccent } from './kpi-card';

type Accent = 'violet' | 'orange' | 'rose' | 'blue' | 'purple' | 'emerald' | 'amber' | 'zinc';

// « violet » est l'ancien accent d'action (désormais orange) ; « zinc », l'accent par défaut, prend un bleu ciel.
const TO_KPI: Record<Accent, KpiAccent> = {
  violet: 'orange',
  orange: 'orange',
  rose: 'rose',
  blue: 'blue',
  purple: 'purple',
  emerald: 'emerald',
  amber: 'amber',
  zinc: 'sky',
};

const hintColors = {
  neutral: 'text-zinc-500 dark:text-zinc-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

export function StatCard({
  label,
  value,
  hint,
  hintTone,
  icon,
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
  return (
    <KpiCard
      label={label}
      value={value}
      icon={icon}
      accent={TO_KPI[accent]}
      href={href}
      className={className}
      hint={hint ? <span className={cn(hintColors[hintTone ?? 'neutral'])}>{hint}</span> : undefined}
    />
  );
}
