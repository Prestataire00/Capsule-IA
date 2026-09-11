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
