'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, Loader2, Upload } from 'lucide-react';

/**
 * Un PDF ne s'annote pas ici : on le télécharge converti en Word, on
 * l'annote dans Word, puis on dépose la version annotée pour le formateur.
 */
export function AnnoterEnWord({ supportId, estPdf }: { supportId: string; estPdf: boolean }) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const deposer = (fichier: File) =>
    start(async () => {
      setMessage(null);
      const form = new FormData();
      form.set('fichier', fichier);
      const res = await fetch(`/api/supports/${supportId}/version-annotee`, { method: 'POST', body: form });
      const corps = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setMessage({ ok: false, texte: corps.error ?? 'Le dépôt a échoué.' });
      setMessage({ ok: true, texte: 'Version annotée envoyée au formateur.' });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estPdf && (
        <a
          href={`/api/supports/${supportId}/word`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          title="La première conversion lit tout le document : comptez une à deux minutes."
        >
          <FileDown className="w-3.5 h-3.5" /> Télécharger en Word pour annoter
        </a>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => champ.current?.click()}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Déposer la version annotée
      </button>
      <input
        ref={champ}
        type="file"
        accept=".docx,.doc,.odt,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) deposer(f);
          e.target.value = '';
        }}
      />
      {message && (
        <span className={`text-[12px] ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.texte}
        </span>
      )}
    </div>
  );
}
