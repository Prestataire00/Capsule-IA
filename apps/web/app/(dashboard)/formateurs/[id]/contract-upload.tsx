// ARCHETYPE: workflow
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, FileText, Download } from 'lucide-react';

/** Traduit la réponse d'une route de dépôt en message lisible. */
function messageErreur(json: { error?: string; detail?: string }): string {
  switch (json.error) {
    case 'forbidden':
      return 'Réservé aux administrateurs.';
    case 'unauthenticated':
      return 'Session expirée — reconnectez-vous.';
    case 'invalid_file_type':
      return `Format non accepté${json.detail ? ` (${json.detail})` : ''}. Les photos prises sur iPhone sont souvent en HEIC : exportez-les en JPEG.`;
    case 'file_too_large':
      return 'Fichier trop lourd.';
    case 'trainer_not_found':
      return 'Formateur introuvable.';
    default:
      return `Échec de l'envoi${json.detail ? ` : ${json.detail}` : ''}.`;
  }
}


export function ContractUpload({
  trainerId,
  hasContract,
  signedUrl,
}: {
  trainerId: string;
  hasContract: boolean;
  signedUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.type !== 'application/pdf') {
      setError('Le contrat doit être un PDF.');
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/formateurs/${trainerId}/contract/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) setError(messageErreur(json));
      else router.refresh();
    } catch {
      setError('Échec de l’envoi.');
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {hasContract ? (
        <div className="flex items-center gap-2 text-[13px]">
          <FileText className="w-4 h-4 text-emerald-500" />
          <span className="text-zinc-700 dark:text-zinc-300">Contrat enregistré</span>
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400 hover:underline ml-1"
            >
              <Download className="w-3.5 h-3.5" /> Télécharger
            </a>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun contrat déposé.</p>
      )}

      <input ref={inputRef} type="file" accept="application/pdf" onChange={onPick} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 disabled:opacity-50 transition"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {hasContract ? 'Remplacer le contrat (PDF)' : 'Déposer le contrat (PDF)'}
      </button>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
