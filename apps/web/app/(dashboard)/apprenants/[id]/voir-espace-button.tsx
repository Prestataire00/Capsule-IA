'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { generateApprenantLink } from '@/app/(dashboard)/dossiers/[id]/acces-apprenant/actions';

/** Ouvre l'espace apprenant (lien signé) de ce dossier dans un nouvel onglet. */
export function VoirEspaceButton({ dossierId }: { dossierId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    setLoading(true);
    setError(false);
    const res = await generateApprenantLink(dossierId);
    setLoading(false);
    if (res.ok) {
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } else {
      setError(true);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
      Voir l'espace apprenant
      {error && <span className="text-[11px] text-red-600">— échec</span>}
    </button>
  );
}
