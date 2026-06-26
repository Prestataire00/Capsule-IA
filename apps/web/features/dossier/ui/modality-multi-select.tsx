'use client';

import { cn } from '@/shared/lib/cn';
import { MODALITIES, type Modality } from '@/features/dossier/modality-set';

const LABELS: Record<Modality, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

// Multi-sélection des modalités. La 1ʳᵉ de `value` est la primaire (badge).
export function ModalityMultiSelect({
  value,
  onChange,
}: {
  value: Modality[];
  onChange: (next: Modality[]) => void;
}) {
  const toggle = (m: Modality) => {
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {MODALITIES.map((m) => {
        const active = value.includes(m);
        const isPrimary = value[0] === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border transition',
              active
                ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                : 'bg-white dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300',
            )}
          >
            {LABELS[m]}
            {isPrimary && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500 text-white">primaire</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
