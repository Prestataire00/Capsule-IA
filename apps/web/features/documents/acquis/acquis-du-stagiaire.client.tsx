'use client';

import { useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import type { NiveauAcquis } from '../acquis-objectifs';
import { AcquisObjectifs } from './acquis-objectifs.client';

/**
 * Sous chaque stagiaire, dans Participants : ses acquis objectif par objectif
 * (0236), repliés par défaut. Le résumé dit d'un coup d'œil s'il y a une
 * exception.
 */
export function AcquisDuStagiaire({
  dossierId,
  learnerId,
  sessionId,
  lignes,
  modifiable,
}: {
  dossierId: string;
  learnerId: string;
  sessionId: string;
  lignes: ReadonlyArray<{ objectif: string; niveau: NiveauAcquis }>;
  modifiable: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const acquis = lignes.filter((l) => l.niveau === 'acquis').length;
  const resume = acquis === lignes.length ? 'tous acquis' : `${acquis}/${lignes.length} acquis`;
  return (
    <span className="block mt-1.5">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium transition hover:ring-1 hover:ring-current ${
          acquis === lignes.length
            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        }`}
      >
        <Target className="w-3 h-3" aria-hidden />
        Acquis par objectif · {resume}
        <ChevronDown className={`w-3 h-3 transition ${ouvert ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {ouvert && (
        <span className="mt-2 block rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-3 py-2">
          <AcquisObjectifs dossierId={dossierId} learnerId={learnerId} sessionId={sessionId} lignes={lignes} modifiable={modifiable} compact />
        </span>
      )}
    </span>
  );
}
