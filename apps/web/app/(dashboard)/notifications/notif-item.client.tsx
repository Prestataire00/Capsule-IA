'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markNotificationRead } from './mark-read-action';

/**
 * Ligne de notification cliquable : au clic, on marque la notification comme lue
 * (elle disparaît de la liste, qui n'affiche que les non-lues) puis on navigue
 * vers la cible (ou on rafraîchit si la notification n'a pas de lien).
 */
export function NotifItem({
  id,
  href,
  children,
}: {
  id: string;
  href: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [gone, setGone] = useState(false);

  function handleClick() {
    setGone(true);
    start(async () => {
      await markNotificationRead(id);
      if (href) router.push(href);
      else router.refresh();
    });
  }

  // Notification sans lien : une fois cliquée, on la retire immédiatement.
  if (gone && !href) return null;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        className="block cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors focus:outline-none focus-visible:bg-orange-50/60 dark:focus-visible:bg-orange-950/30"
      >
        {children}
      </div>
    </li>
  );
}
