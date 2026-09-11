'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pendant qu'on émarge, la feuille se met à jour seule : les signatures faites
 * sur les téléphones apparaissent sans recharger la page.
 */
export function LiveRefresh({ everyMs = 15_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}

/** Vrai entre une heure avant la première demi-journée ouverte et deux heures après la dernière. */
export function emargementEnCours(sheets: readonly { windowStart: string; windowEnd: string; finalized: boolean }[], now = Date.now()): boolean {
  return sheets.some(
    (s) => !s.finalized && now >= new Date(s.windowStart).getTime() - 60 * 60_000 && now <= new Date(s.windowEnd).getTime() + 120 * 60_000,
  );
}
