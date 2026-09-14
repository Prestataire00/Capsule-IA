import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** En-tête commun aux pages d'une séance côté formateur : retour, date, titre. */
export function SeanceNav({
  sessionId,
  quand,
  titre,
  sousTitre,
  actif,
}: {
  sessionId: string;
  quand: string;
  titre: string;
  sousTitre?: string;
  actif: 'seance' | 'supports' | 'messages';
}) {
  const onglets = [
    { cle: 'seance' as const, label: 'La séance', href: `/seance/${sessionId}` },
    { cle: 'supports' as const, label: 'Supports de cours', href: `/seance/${sessionId}/supports` },
    { cle: 'messages' as const, label: 'Messages', href: `/seance/${sessionId}/messages` },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/mes-sessions"
        className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="w-3 h-3" /> Mes sessions
      </Link>
      <header>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 tabular-nums">{quand}</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{titre}</h1>
        {sousTitre && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{sousTitre}</p>}
      </header>
      <nav className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 -mb-px overflow-x-auto">
        {onglets.map((o) => (
          <Link
            key={o.cle}
            href={o.href}
            className={`text-[13px] px-3 py-2 border-b-2 whitespace-nowrap transition ${
              o.cle === actif
                ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-medium'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
