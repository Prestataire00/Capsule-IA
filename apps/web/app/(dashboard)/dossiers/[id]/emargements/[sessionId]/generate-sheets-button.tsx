'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarPlus } from 'lucide-react';
import { ensureSessionSheets, convertLegacyFullSheet } from './actions';

export function GenerateSheetsButton({ sessionId, hasLegacyFull }: { sessionId: string; hasLegacyFull: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    start(async () => {
      const r = hasLegacyFull ? await convertLegacyFullSheet(sessionId) : await ensureSessionSheets(sessionId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="text-center space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
        {hasLegacyFull ? 'Convertir en feuilles matin / après-midi' : "Générer les feuilles d'émargement"}
      </button>
      {error && <p className="text-[12px] text-red-600 font-mono">{error}</p>}
    </div>
  );
}
