'use client';
// ARCHETYPE: command
// Barre horizontale « maintenant » (style Outlook) pour la grille hebdo agenda.
// Positionnée en absolu dans le conteneur relatif de la grille ; l'offset vertical
// suit l'heure courante (Europe/Paris) et se rafraîchit chaque minute. Ne s'affiche
// que si la semaine visible contient aujourd'hui et si l'heure est dans la plage.
// Au montage, centre automatiquement la grille sur l'heure courante (autoScroll).

import { useEffect, useRef, useState } from 'react';

const TZ = 'Europe/Paris';

export function AgendaNowLine({
  startHour,
  endHour,
  rowH,
  show,
  gutter = 52,
  autoScroll = true,
}: {
  startHour: number;
  endHour: number;
  rowH: number;
  show: boolean;
  gutter?: number;
  autoScroll?: boolean;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const compute = () => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
      const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
      setMinutes(h * 60 + m);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

  // Centre la grille sur « maintenant » une seule fois, après le 1er rendu visible.
  useEffect(() => {
    if (!autoScroll || scrolledRef.current || !ref.current) return;
    scrolledRef.current = true;
    ref.current.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [minutes, autoScroll]);

  if (!show || minutes === null) return null;
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  if (minutes < startMin || minutes > endMin) return null;

  const top = ((minutes - startMin) / 60) * rowH;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-20 flex items-center"
      style={{ top, left: gutter, right: 0 }}
    >
      <span
        className="-ml-[6px] rounded-sm bg-red-500 px-1 py-0.5 text-[9px] font-semibold leading-none text-white"
        style={{ transform: 'translateY(-1px)' }}
      >
        {hh}:{mm}
      </span>
      <span className="h-2 w-2 rounded-full bg-red-500" />
      <span className="h-px flex-1 bg-red-500" />
    </div>
  );
}
