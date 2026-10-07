'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Le lien arrive 10 minutes avant le début : la page attend l'ouverture et
 * affiche le formulaire d'elle-même, sans que le stagiaire ait à revenir.
 */
export function OuvertureAuto({ ouverture }: { ouverture: number }) {
  const router = useRouter();
  // Calculé au montage seulement : l'heure du serveur et celle du téléphone diffèrent.
  const [reste, setReste] = useState<number | null>(null);

  useEffect(() => {
    setReste(Math.max(0, ouverture - Date.now()));
    const tic = setInterval(() => {
      const r = Math.max(0, ouverture - Date.now());
      setReste(r);
      if (r === 0) {
        clearInterval(tic);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(tic);
  }, [ouverture, router]);

  if (reste === null) return null;
  const min = Math.floor(reste / 60_000);
  const sec = Math.floor((reste % 60_000) / 1000);
  return (
    <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums" aria-live="polite">
      {reste > 0 ? `Ouverture dans ${min > 0 ? `${min} min ` : ''}${String(sec).padStart(2, '0')} s` : 'Ouverture…'}
    </p>
  );
}
