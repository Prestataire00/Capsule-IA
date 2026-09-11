'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Paperclip } from 'lucide-react';
import { JUSTIFICATION_ACCEPT, MAX_JUSTIFICATION_BYTES } from '@/features/attendance/justification-rules';
import { attendanceErrorLabel } from '@/features/attendance/schemas';

/**
 * Dépôt d'un justificatif d'absence (apprenant ou équipe). Envoi par une
 * route API : les photos de téléphone dépassent la limite des actions serveur.
 */
export function JustificationUpload({
  endpoint,
  fields,
  hint,
  compact = false,
}: {
  endpoint: string;
  fields: Record<string, string>;
  hint?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [etat, setEtat] = useState<'libre' | 'envoi' | 'envoye'>('libre');
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async () => {
    if (!fichier) return setErreur(attendanceErrorLabel('justification_missing'));
    if (fichier.size > MAX_JUSTIFICATION_BYTES) return setErreur(attendanceErrorLabel('justification_too_large'));
    setErreur(null);
    setEtat('envoi');
    const corps = new FormData();
    for (const [k, v] of Object.entries(fields)) corps.set(k, v);
    corps.set('file', fichier);
    if (commentaire.trim()) corps.set('comment', commentaire.trim());
    try {
      const res = await fetch(endpoint, { method: 'POST', body: corps });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !r.ok) {
        setEtat('libre');
        return setErreur(attendanceErrorLabel(r.error));
      }
      setEtat('envoye');
      setFichier(null);
      setCommentaire('');
      if (input.current) input.current.value = '';
      router.refresh();
    } catch {
      setEtat('libre');
      setErreur('Connexion perdue. Réessayez.');
    }
  };

  const champ =
    'w-full text-[13px] px-2.5 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

  return (
    <div className={`space-y-2 text-left ${compact ? '' : 'rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-3 bg-zinc-50/60 dark:bg-zinc-900/40'}`}>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" aria-hidden />
          Justificatif (PDF ou photo, 10 Mo au plus)
        </span>
        <input
          ref={input}
          type="file"
          accept={JUSTIFICATION_ACCEPT}
          onChange={(e) => {
            setEtat('libre');
            setFichier(e.target.files?.[0] ?? null);
          }}
          className="block w-full text-[12px] text-zinc-600 dark:text-zinc-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-zinc-900 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900 file:text-[12px]"
        />
      </label>
      <input
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        maxLength={500}
        placeholder="Précision (facultatif) : arrêt maladie, convocation…"
        className={champ}
        aria-label="Précision sur le justificatif"
      />
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
      {erreur && (
        <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
          {erreur}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={etat === 'envoi' || !fichier}
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          {etat === 'envoi' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Envoyer le justificatif
        </button>
        {etat === 'envoye' && (
          <span role="status" className="text-[12px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Justificatif envoyé
          </span>
        )}
      </div>
    </div>
  );
}
