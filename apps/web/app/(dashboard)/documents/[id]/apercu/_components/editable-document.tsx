'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Pencil, Save, X, Loader2 } from 'lucide-react';
import { RichTextEditor } from '@/features/documents/editor/rich-text-editor';
import { updateDocumentHtml } from '../actions';

// Aperçu d'un document HTML généré, éditable en place (éditeur riche, sans
// panneau de variables car les valeurs sont déjà résolues).
export function EditableDocument({
  documentId,
  initialHtml,
  logoSrc,
  orgName,
}: {
  documentId: string;
  initialHtml: string;
  logoSrc?: string;
  orgName?: string;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(updateDocumentHtml);
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState(initialHtml);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const res = await executeAsync({ documentId, contentHtml: html });
    setSaving(false);
    if (res?.data?.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError("L'enregistrement a échoué.");
    }
  }

  if (editing) {
    return (
      <div className="max-w-[860px] mx-auto space-y-3">
        <div className="no-print flex items-center justify-between">
          <span className="text-[13px] text-zinc-500">Édition du document</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHtml(initialHtml);
                setEditing(false);
              }}
              disabled={saving}
              className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-9 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          </div>
        </div>
        <RichTextEditor value={html} onChange={setHtml} showVariablesPanel={false} />
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="no-print max-w-[760px] mx-auto flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[13px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1.5 transition"
        >
          <Pencil className="w-3.5 h-3.5" /> Modifier
        </button>
      </div>
      <article className="doc-sheet bg-white text-zinc-900 max-w-[760px] mx-auto rounded-sm shadow-lg px-12 py-12">
        {logoSrc && (
          <div className="doc-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={orgName || 'Logo'} />
            {orgName && <span className="doc-org-name">{orgName}</span>}
          </div>
        )}
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <div className="doc-brand-footer">
          <span>{orgName}</span>
          <span>Généré avec Capsule IA</span>
        </div>
      </article>
    </>
  );
}
