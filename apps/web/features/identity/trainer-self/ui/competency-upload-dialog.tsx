'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Plus, X, Upload, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

type Form = {
  kind: 'diploma' | 'certification' | 'experience' | 'cv';
  title: string;
  issuer?: string;
  obtainedAt?: string;
  expiresAt?: string;
};

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

export function CompetencyUploadDialog({
  trainerId,
  organizationId,
}: {
  trainerId: string;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, reset } = useForm<Form>({ defaultValues: { kind: 'diploma' } });

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    const meta: Record<string, string> = {
      trainerId,
      organizationId,
      kind: data.kind,
      title: data.title,
    };
    if (data.issuer) meta.issuer = data.issuer;
    if (data.obtainedAt) meta.obtainedAt = data.obtainedAt;
    if (data.expiresAt) meta.expiresAt = data.expiresAt;
    fd.append('meta', JSON.stringify(meta));
    if (file) fd.append('file', file);

    const res = await fetch('/cv/api/upload', { method: 'POST', body: fd });
    const body = await res.json();
    setSubmitting(false);

    if (!body.ok) {
      setError(body.error || 'Échec');
      return;
    }
    setOpen(false);
    reset();
    setFile(null);
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 text-[12px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 shadow-sm transition"
      >
        <Plus className="w-3.5 h-3.5" /> Ajouter
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-950 rounded-2xl shadow-lg max-w-md w-full p-5 space-y-4 border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-medium">Nouvelle compétence</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <FormField label="Type" required>
              <select className={inputClass} {...register('kind', { required: true })}>
                <option value="diploma">Diplôme</option>
                <option value="certification">Certification</option>
                <option value="experience">Expérience</option>
                <option value="cv">CV</option>
              </select>
            </FormField>

            <FormField label="Titre" required>
              <input className={inputClass} {...register('title', { required: true, maxLength: 200 })} />
            </FormField>

            <FormField label="Émetteur">
              <input className={inputClass} {...register('issuer', { maxLength: 200 })} />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Obtenu le">
                <input type="date" className={inputClass} {...register('obtainedAt')} />
              </FormField>
              <FormField label="Expire le">
                <input type="date" className={inputClass} {...register('expiresAt')} />
              </FormField>
            </div>

            <FormField label="Document (PDF/JPG/PNG, max 10 Mo)">
              <input
                type="file"
                accept={ALLOWED.join(',')}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-[12px] file:mr-2 file:px-2 file:py-1 file:rounded file:border file:bg-zinc-50 dark:file:bg-zinc-900 file:border-zinc-200 dark:file:border-zinc-800"
              />
            </FormField>

            {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-[13px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
