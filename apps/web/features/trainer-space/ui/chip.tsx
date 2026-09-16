// ARCHETYPE: shared (command)
// Pastilles colorées de l'espace formateur — un code couleur constant d'un
// écran à l'autre : bleu pour les dates et les séances, rose pour les
// personnes, sarcelle pour le client, ambre pour les consignes.
import type { ComponentType } from 'react';
import { ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { cn } from '@/shared/lib/cn';

/** Pastille d'information : pictogramme + valeur, sur fond teinté. */
export function Chip({
  accent,
  icon: Icon,
  children,
  className,
}: {
  accent: Accent;
  icon?: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium tabular-nums',
        ACCENTS[accent].soft,
        className,
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

/** Carré coloré d'un titre de section : le repère visuel de la carte. */
export function CarreIcone({
  accent,
  icon: Icon,
  plein,
}: {
  accent: Accent;
  icon: ComponentType<{ className?: string }>;
  plein?: boolean;
}) {
  const a = ACCENTS[accent];
  return (
    <span
      className={cn(
        'w-8 h-8 rounded-lg grid place-items-center shrink-0',
        plein ? cn('text-white shadow-md', a.chip) : a.soft,
      )}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </span>
  );
}

/** Initiales sur disque coloré : une personne se reconnaît d'un coup d'œil. */
export function Initiales({
  accent,
  prenom,
  nom,
}: {
  accent: Accent;
  prenom?: string | null;
  nom?: string | null;
}) {
  const lettres = `${prenom?.trim().charAt(0) ?? ''}${nom?.trim().charAt(0) ?? ''}`.toUpperCase() || '?';
  return (
    <span
      className={cn(
        'w-9 h-9 rounded-full grid place-items-center text-[13px] font-semibold shrink-0',
        ACCENTS[accent].soft,
      )}
      aria-hidden
    >
      {lettres}
    </span>
  );
}
