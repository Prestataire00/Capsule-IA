'use client';

import { useRef, useState } from 'react';
import { Loader2, Plus, Upload } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { supabaseBrowser } from '@/shared/lib/supabase/client';
import { createExercise } from './actions';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const ACCEPT_ATTR =
  '.pdf,.pptx,.xlsx,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg';

export function ExerciseForm({
  dossierId,
  organizationId,
}: {
  dossierId: string;
  organizationId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);

  const createAction = useAction(createExercise);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let attachmentPath: string | undefined;

    if (selectedFile) {
      if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
        setUploadError('Format non supporté (PDF, PPTX, XLSX, DOCX, PNG, JPEG)');
        return;
      }
      if (selectedFile.size > 50 * 1024 * 1024) {
        setUploadError('Fichier trop lourd (50 Mo max)');
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const storagePath = `${organizationId}/exercices/${dossierId}/${crypto.randomUUID()}-${selectedFile.name}`;
        const sb = supabaseBrowser();
        const { error: storageError } = await sb.storage
          .from('pedagogical')
          .upload(storagePath, selectedFile, { upsert: false });

        if (storageError) {
          setUploadError(`Erreur upload : ${storageError.message}`);
          setUploading(false);
          return;
        }

        attachmentPath = storagePath;
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Erreur inattendue');
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    createAction.execute({
      dossierId,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      attachmentPath,
    });

    setTitle('');
    setInstructions('');
    setDueAt('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setOpen(false);
  };

  const isSubmitting = uploading || createAction.isExecuting;
  const actionError = createAction.result?.serverError
    ? String(createAction.result.serverError)
    : null;
  const error = uploadError ?? actionError;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-2"
      >
        <Plus className="w-3.5 h-3.5" />
        Nouvel exercice
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3"
    >
      <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Nouvel exercice</p>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de l'exercice *"
        maxLength={200}
        required
        className="w-full h-9 text-[13px] px-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
      />

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions (optionnel)"
        maxLength={5000}
        rows={3}
        className="w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 resize-none"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-zinc-500 dark:text-zinc-400">Échéance :</label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-9 text-[13px] px-3 rounded-lg tabular-nums border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Énoncé (optionnel) :</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={handleFileChange}
            className="text-[12px] text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 file:cursor-pointer hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 transition"
          />
          {selectedFile && (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
              <Upload className="w-3 h-3" />
              {selectedFile.name}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
      {createAction.result?.data?.ok && !isSubmitting && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Exercice créé.</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Créer
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
