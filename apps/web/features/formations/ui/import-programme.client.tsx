'use client';

import { useRef, useState, useTransition } from 'react';
import { FileUp, Loader2, Check } from 'lucide-react';
import { importProgrammeFromPdf } from '../programme/import-actions';
import type { ExtractedProgramme } from '../programme/extract-from-pdf';

/**
 * Import d'un programme PDF existant : le fichier est lu par l'IA et les champs
 * du formulaire sont pré-remplis. Rien n'est enregistré — l'utilisateur relit,
 * corrige, puis enregistre la formation comme d'habitude.
 */
export function ImportProgrammeButton({
  onImported,
}: {
  onImported: (data: ExtractedProgramme) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<number | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    setFilled(null);
    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const res = await importProgrammeFromPdf(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onImported(res.data);
      setFilled(countFilled(res.data));
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 disabled:opacity-50 transition"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {pending ? 'Lecture du programme…' : 'Importer un programme (PDF)'}
        </button>
        {filled !== null && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            {filled} champ{filled > 1 ? 's' : ''} pré-rempli{filled > 1 ? 's' : ''} — relisez avant d’enregistrer.
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Réinitialise pour permettre de ré-importer deux fois le même fichier.
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Le PDF est lu par l’IA et remplit le programme, les objectifs, le public, les prérequis, les
        méthodes, l’évaluation et la durée. Les champs déjà saisis ne sont pas écrasés. PDF de 5 Mo maximum.
      </p>

      {error && <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

function countFilled(data: ExtractedProgramme): number {
  return Object.values(data).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== '')).length;
}
