'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { supabaseBrowser } from '@/shared/lib/supabase/client';
import { createSupport, toggleSupportPublish, deleteSupport } from './actions';

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

export function SupportsUploader({
  moduleId,
  organizationId,
  formationId,
}: {
  moduleId: string;
  organizationId: string;
  formationId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const createAction = useAction(createSupport);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    if (file && !title) {
      // Pré-remplir le titre avec le nom du fichier (sans extension)
      setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 200));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !title.trim()) return;

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
      const storagePath = `${organizationId}/${moduleId}/${crypto.randomUUID()}-${selectedFile.name}`;
      const sb = supabaseBrowser();
      const { error: storageError } = await sb.storage
        .from('pedagogical')
        .upload(storagePath, selectedFile, { upsert: false });

      if (storageError) {
        setUploadError(`Erreur upload : ${storageError.message}`);
        setUploading(false);
        return;
      }

      createAction.execute({
        moduleId,
        title: title.trim(),
        storagePath,
        mimeType: selectedFile.type,
        fileSizeBytes: selectedFile.size,
      });

      // Reset form
      setTitle('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setUploading(false);
    }
  };

  const isSubmitting = uploading || createAction.isExecuting;
  const actionError = createAction.result?.serverError
    ? String(createAction.result.serverError)
    : null;
  const error = uploadError ?? actionError;

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          className="text-[12px] text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 file:cursor-pointer hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 transition"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre du support"
          maxLength={200}
          required
          className="flex-1 min-w-[180px] text-[13px] px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-400 shadow-sm"
        />
        <button
          type="submit"
          disabled={isSubmitting || !selectedFile || !title.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-medium shadow-sm transition"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Ajouter
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
      {createAction.result?.data?.ok && !isSubmitting && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Support ajouté.</p>
      )}
    </form>
  );
}

export function TogglePublishButton({
  resourceId,
  isPublished,
}: {
  resourceId: string;
  isPublished: boolean;
}) {
  const action = useAction(toggleSupportPublish);
  return (
    <button
      type="button"
      disabled={action.isExecuting}
      onClick={() => action.execute({ resourceId, isPublished: !isPublished })}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shadow-sm transition disabled:opacity-50"
      title={isPublished ? 'Masquer' : 'Publier'}
    >
      {action.isExecuting ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPublished ? (
        <EyeOff className="w-3 h-3" />
      ) : (
        <Eye className="w-3 h-3" />
      )}
      {isPublished ? 'Masquer' : 'Publier'}
    </button>
  );
}

export function DeleteSupportButton({ resourceId }: { resourceId: string }) {
  const action = useAction(deleteSupport);
  return (
    <button
      type="button"
      disabled={action.isExecuting}
      onClick={() => {
        if (!confirm('Supprimer ce support ?')) return;
        action.execute({ resourceId });
      }}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-red-200 dark:border-red-900/40 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 shadow-sm transition disabled:opacity-50"
      title="Supprimer"
    >
      {action.isExecuting ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Trash2 className="w-3 h-3" />
      )}
      Supprimer
    </button>
  );
}
